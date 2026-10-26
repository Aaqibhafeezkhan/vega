import { thumbCrop, type DecodedImage } from '../core/background/bars'
import { createBackgroundResolver, type SongBg } from '../core/background/resolver'
import { youtube } from '../core/background/youtube'
import { lyricsService } from '../core/lyrics/service'
import type { LyraApi, Unsubscribe } from '../shared/ipc'
import {
  DEFAULT_SETTINGS,
  type BackgroundMedia,
  type ConnectionStatus,
  type ModeEvent,
  type PlaybackSnapshot,
  type SavedMoment,
  type Settings,
  type ViewMode
} from '../shared/types'
import { installBrowserPlatform, LocalStore, setAppVersion } from './platform'
import { deleteMedia, hydrateMedia, mediaUrl, saveMedia } from './media'
import type { VegaHost } from './types'

/**
 * Vega's implementation of `window.lyra`: the same surface Lyra's Windows preload and Android bridge expose, so
 * Lyra's real UI (backdrop, video backgrounds, karaoke, lyrics, studio-less) runs unchanged inside Vega.
 * Playback comes from the parent page (`window.parent.__vegaHost`); lyrics and backgrounds use Lyra's shared core.
 */

installBrowserPlatform()
setAppVersion('vega')

const host = (): VegaHost => {
  const h = window.parent?.__vegaHost ?? window.__vegaHost
  if (!h) throw new Error('Lyra must run inside Vega')
  return h
}

/** resolves once imported background files are ready to play */
export const ready: Promise<void> = hydrateMedia()

function emitter<T>(): { on(cb: (v: T) => void): Unsubscribe; emit(v: T): void } {
  const set = new Set<(v: T) => void>()
  return {
    on(cb) {
      set.add(cb)
      return () => set.delete(cb)
    },
    emit(v) {
      set.forEach((cb) => cb(v))
    }
  }
}

const noop = (): void => undefined

// ---------------- settings
const settingsStore = new LocalStore<Settings>('settings', {
  ...DEFAULT_SETTINGS,
  onboarded: true, // Vega has its own first-run; no Lyra welcome card
  defaultMode: 'mini',
  backgroundInMini: true
})
const settingsChanged = emitter<Settings>()

function sanitize(s: Settings): Settings {
  const clamp = (n: unknown, lo: number, hi: number, d: number): number => (typeof n === 'number' && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d)
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    backgroundDim: clamp(s.backgroundDim, 0.2, 0.9, 0.5),
    lyricFontSize: clamp(s.lyricFontSize, 24, 72, 40),
    lineSpacing: clamp(s.lineSpacing, 1, 2, 1.35),
    lyricOffsetMs: clamp(s.lyricOffsetMs, -3000, 3000, 0),
    onboarded: true
  }
}

// ---------------- window / mode: Lyra is always the fullscreen player inside Vega
const mode: ViewMode = 'full'
const modeChanged = emitter<ModeEvent>()

// ---------------- playback (pushed by Vega)
const status: ConnectionStatus = { state: 'connected', userName: 'Vega', product: 'premium', controlsLimited: false }
const statusChanged = emitter<ConnectionStatus>()
const playbackChanged = emitter<PlaybackSnapshot>()
let unsubscribe: (() => void) | null = null

function startFeed(): void {
  if (unsubscribe) return
  unsubscribe = host().subscribe((s) => {
    if (s) playbackChanged.emit(s)
  })
}

// ---------------- artwork / moments / backgrounds
const artCache = new Map<string, string | null>()
async function artDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url
  if (artCache.has(url)) return artCache.get(url) ?? null
  // Load as an image (allowed by the page's img-src policy, unlike fetch to arbitrary hosts) and re-encode it.
  // Needs the image host to allow cross-origin reads; otherwise the UI falls back to its generated look.
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const size = 640
    const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * scale))
    c.height = Math.max(1, Math.round(img.naturalHeight * scale))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const data = c.toDataURL('image/jpeg', 0.9)
    artCache.set(url, data)
    return data
  } catch {
    artCache.set(url, null)
    return null
  }
}

const momentsStore = new LocalStore<{ items: SavedMoment[] }>('moments', { items: [] })
const songsStore = new LocalStore<{ songs: Record<string, SongBg> }>('backgrounds', { songs: {} })

/** Decode a thumbnail through a canvas so the shared core can look for black bars. */
async function decodeThumb(bytes: ArrayBuffer): Promise<DecodedImage | null> {
  const bmp = await createImageBitmap(new Blob([bytes]))
  const c = new OffscreenCanvas(160, 90)
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, 160, 90)
  const d = ctx.getImageData(0, 0, 160, 90)
  return { width: 160, height: 90, pixels: d.data, order: 'rgba' }
}

const resolveBackground = createBackgroundResolver({
  settings: () => settingsStore.get(),
  songs: () => songsStore.get().songs,
  mediaSpec: (m, scope) => {
    const url = mediaUrl(m.file)
    return url ? { kind: 'media', url, media: m.kind, name: m.name, scope } : null
  },
  clipUrl: (url) => host().clipUrl(url),
  crop: (videoId) => thumbCrop(videoId, decodeThumb)
})

/** Pick a video/image file from disk and keep it inside the browser/app for use as a background. */
function chooseFile(): Promise<{ file: File } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*,image/*'
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0] } : null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Delete a picked file once nothing refers to it any more. */
function dropIfUnused(file: string): void {
  const used = settingsStore.get().customBackground?.file === file || Object.values(songsStore.get().songs).some((s) => s.media?.file === file)
  if (!used) void deleteMedia(file)
}

async function withRetry<T extends { status: string }>(first: () => Promise<T>, again: () => Promise<T>): Promise<T> {
  const r = await first()
  if (r.status !== 'error') return r
  await new Promise((ok) => setTimeout(ok, 3000))
  return again()
}

export const vegaApi: LyraApi = {
  settings: {
    get: async () => sanitize(settingsStore.get()),
    set: async (patch) => {
      const next = sanitize({ ...settingsStore.get(), ...patch })
      settingsStore.set(next)
      settingsChanged.emit(next)
      return next
    },
    reset: async () => {
      const next = sanitize({ ...DEFAULT_SETTINGS, defaultMode: 'mini', backgroundInMini: true })
      settingsStore.set(next)
      settingsChanged.emit(next)
      return next
    },
    onChange: settingsChanged.on
  },
  window: {
    // Lyra "leaving fullscreen" means closing the overlay in Vega
    setMode: async (m) => {
      if (m !== 'full') host().close()
    },
    getMode: async () => mode,
    onMode: modeChanged.on,
    onFade: () => noop,
    settle: noop,
    resizeStart: noop,
    resizeMove: noop,
    resizeEnd: noop,
    dragStart: noop,
    dragMove: noop,
    dragEnd: noop,
    hide: () => host().close(),
    minimize: () => host().close(),
    quit: () => host().close()
  },
  spotify: {
    connect: async () => status,
    disconnect: async () => undefined,
    startDemo: async () => undefined,
    useLocal: async () => undefined,
    getStatus: async () => status,
    getSnapshot: async () => {
      startFeed()
      return host().snapshot()
    },
    onStatus: statusChanged.on,
    onPlayback: (cb) => {
      startFeed()
      return playbackChanged.on(cb)
    }
  },
  player: {
    command: async (cmd) => (host().command(cmd) ? { ok: true } : { ok: false, reason: 'unsupported', error: 'Nothing is playing.' }),
    isLiked: async (id) => host().isLiked(id),
    setLiked: async (id, liked) => (host().setLiked(id, liked) ? { ok: true } : { ok: false, reason: 'unsupported', error: 'Could not update your library.' }),
    queue: async () => host().queue(),
    recent: async () => null,
    openInSpotify: async () => undefined
  },
  lyrics: {
    get: (t) => withRetry(() => lyricsService.get(t), () => lyricsService.get(t, true)),
    refresh: (t) => lyricsService.get(t, true),
    candidates: (t) => lyricsService.candidates(t),
    choose: (t, provider, id) => lyricsService.choose(t, provider, id),
    clearPin: (t) => lyricsService.clearPin(t)
  },
  art: { get: artDataUrl },
  moments: {
    list: async () => momentsStore.get().items,
    add: async (m) => {
      const items = momentsStore.get().items
      if (items.some((x) => x.trackId === m.trackId && x.text === m.text)) return items
      const next = [{ ...m, id: crypto.randomUUID(), savedAt: Date.now() }, ...items].slice(0, 500)
      momentsStore.set({ items: next })
      return next
    },
    remove: async (id) => {
      const next = momentsStore.get().items.filter((x) => x.id !== id)
      momentsStore.set({ items: next })
      return next
    }
  },
  background: {
    resolve: (t) => resolveBackground(t),
    pick: async (scope, trackId) => {
      if (scope === 'song' && !trackId) return { ok: false, error: 'No song selected.' }
      const picked = await chooseFile()
      if (!picked) return { ok: false }
      const kind: BackgroundMedia['kind'] = picked.file.type.startsWith('video/') ? 'video' : 'image'
      const saved = await saveMedia(picked.file)
      const media: BackgroundMedia = { file: saved, name: picked.file.name, kind }
      if (scope === 'global') {
        const old = settingsStore.get().customBackground
        const next = sanitize({ ...settingsStore.get(), customBackground: media })
        settingsStore.set(next)
        settingsChanged.emit(next)
        if (old && old.file !== saved) dropIfUnused(old.file)
      } else {
        const songs = { ...songsStore.get().songs }
        const old = songs[trackId!]?.media
        songs[trackId!] = { ...songs[trackId!], media }
        songsStore.set({ songs })
        if (old && old.file !== saved) dropIfUnused(old.file)
      }
      return { ok: true }
    },
    clear: async (scope, trackId) => {
      if (scope === 'global') {
        const old = settingsStore.get().customBackground
        const next = sanitize({ ...settingsStore.get(), customBackground: null })
        settingsStore.set(next)
        settingsChanged.emit(next)
        if (old) dropIfUnused(old.file)
      } else if (trackId) {
        const songs = { ...songsStore.get().songs }
        const old = songs[trackId]?.media
        if (songs[trackId]) {
          const { media: _gone, ...rest } = songs[trackId]!
          void _gone
          if (rest.youtube) songs[trackId] = rest
          else delete songs[trackId]
          songsStore.set({ songs })
        }
        if (old) dropIfUnused(old.file)
      }
    },
    hasYoutubeKey: async () => youtube.hasKey(),
    setYoutubeKey: (k) => youtube.setKey(k),
    clearYoutubeKey: async () => youtube.clearKey(),
    youtubeCandidates: (t) => youtube.candidates(t),
    karaokeVideos: (t) => youtube.karaoke(t),
    youtubeChoose: async (trackId, videoId) => {
      const songs = { ...songsStore.get().songs }
      if (videoId) songs[trackId] = { ...songs[trackId], youtube: { videoId, title: '', channel: '', durationSec: null } }
      else if (songs[trackId]) {
        const { youtube: _gone, ...rest } = songs[trackId]!
        void _gone
        if (rest.media) songs[trackId] = rest
        else delete songs[trackId]
      }
      songsStore.set({ songs })
    }
  },
  update: {
    get: async () => ({ state: 'disabled', reason: 'Vega updates itself with the app.' }),
    check: async () => undefined,
    install: async () => undefined,
    onState: () => noop
  },
  studio: {
    open: async () => null,
    write: async () => undefined,
    close: async () => undefined,
    discard: async () => undefined,
    end: async () => undefined,
    reveal: async () => undefined,
    setMic: async () => undefined,
    saveImage: async () => null,
    frameCaptureStart: async () => false,
    frameCaptureStop: async () => null,
    frameRead: async () => null,
    frameCaptureClear: async () => undefined,
    audioStart: async () => ({ ok: false, reason: 'Video export is not available in Vega yet' }),
    audioStop: async () => undefined,
    onAudio: () => () => undefined,
    stageStart: async () => ({ ok: false, reason: 'Video export is not available in Vega yet' }),
    stageSeek: async () => undefined,
    stageSync: async () => undefined,
    stageStop: async () => undefined,
    onFrame: () => () => undefined
  },
  lan: { info: async () => ({ running: false, urls: [], qr: null }), onOffer: () => () => undefined, answer: async () => undefined },
  app: {
    info: async () => ({ version: 'vega', platform: 'web', envClientId: false }),
    diagnostics: async () => `Lyra player inside Vega\n${navigator.userAgent}`,
    copy: async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
    },
    copyImage: async () => false,
    shareImage: async (dataUrl, name) => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = name
      a.click()
      return 'shared'
    },
    failedShortcuts: async () => [],
    onCommand: () => noop
  }
}

window.lyra = vegaApi
