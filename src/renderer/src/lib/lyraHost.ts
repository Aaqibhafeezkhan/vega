import type { PlaybackSnapshot, PlayerCommand, QueueItem, Track as LyraTrack } from '../../../../lyra/shared/types'
import type { VegaHost } from '../../../../lyra/host/types'
import { refKey, type Track } from '@shared/types'
import { useLibrary } from '@/store/library'
import { getPosition, usePlayer } from '@/store/player'
import { toStreamUrl } from '@/lib/desktopBackend'
import { useUi } from '@/store/ui'

/**
 * Bridges Vega's player to Lyra's player UI (which runs in an iframe and talks to `window.__vegaHost`).
 * Vega stays the source of truth: Lyra only displays state and sends commands.
 */

const toLyraTrack = (t: Track): LyraTrack => ({
  id: refKey(t.ref),
  uri: refKey(t.ref),
  title: t.title,
  artists: t.artists,
  album: t.album ?? '',
  releaseYear: t.year ?? null,
  durationMs: t.durationMs,
  artworkUrl: t.artworkUrl ?? null,
  explicit: false,
  webUrl: null
})

function snapshot(): PlaybackSnapshot | null {
  const p = usePlayer.getState()
  const t = p.queue[p.index]
  if (!t) return null
  return {
    track: toLyraTrack(t),
    isPlaying: p.playing,
    positionMs: getPosition(),
    sampledAt: Date.now(),
    device: { id: 'vega', name: 'Vega', type: 'Computer', volumePercent: Math.round(p.volume * 100), supportsVolume: true },
    shuffle: p.shuffle,
    repeat: p.repeat === 'one' ? 'track' : p.repeat === 'all' ? 'context' : 'off',
    isAdOrUnknown: false
  }
}

function command(cmd: PlayerCommand): boolean {
  const p = usePlayer.getState()
  if (!p.queue[p.index]) return false
  switch (cmd.type) {
    case 'play':
      if (!p.playing) p.togglePlay()
      break
    case 'pause':
      if (p.playing) p.togglePlay()
      break
    case 'toggle':
      p.togglePlay()
      break
    case 'next':
      p.next()
      break
    case 'previous':
      p.prev()
      break
    case 'seek':
      p.seek(cmd.positionMs)
      break
    case 'volume':
      p.setVolume(Math.min(1, Math.max(0, cmd.percent / 100)))
      break
    case 'shuffle':
      if (p.shuffle !== cmd.on) p.toggleShuffle()
      break
    case 'repeat': {
      const want = cmd.mode === 'track' ? 'one' : cmd.mode === 'context' ? 'all' : 'off'
      for (let i = 0; i < 3 && usePlayer.getState().repeat !== want; i++) usePlayer.getState().cycleRepeat()
      break
    }
  }
  return true
}

const listeners = new Set<(s: PlaybackSnapshot | null) => void>()
let unsub: (() => void) | null = null
let timer: ReturnType<typeof setInterval> | null = null

const push = (): void => {
  const s = snapshot()
  listeners.forEach((cb) => cb(s))
}

function startFeed(): void {
  if (unsub) return
  // Lyra interpolates position between snapshots, so push on every state change (not on each time tick)...
  let prev = ''
  unsub = usePlayer.subscribe((s) => {
    const key = `${s.index}|${s.queue[s.index] ? refKey(s.queue[s.index]!.ref) : ''}|${s.playing}|${s.shuffle}|${s.repeat}|${Math.round(s.volume * 100)}`
    if (key !== prev) {
      prev = key
      push()
    }
  })
  // ...and resync now and then so seeks, buffering and drift never accumulate
  timer = setInterval(push, 2500)
}

function stopFeed(): void {
  if (listeners.size) return
  unsub?.()
  unsub = null
  if (timer) clearInterval(timer)
  timer = null
}

export const vegaHost: VegaHost = {
  snapshot,
  subscribe(cb) {
    listeners.add(cb)
    startFeed()
    return () => {
      listeners.delete(cb)
      stopFeed()
    }
  },
  command: (cmd) => {
    const ok = command(cmd)
    if (ok) setTimeout(push, 50) // the audio element needs a moment before position/state are accurate
    return ok
  },
  isLiked: (id) => useLibrary.getState().liked.some((t) => refKey(t.ref) === id),
  setLiked: (id, liked) => {
    const lib = useLibrary.getState()
    const track = usePlayer.getState().queue.find((t) => refKey(t.ref) === id) ?? lib.liked.find((t) => refKey(t.ref) === id)
    if (!track) return false
    if (lib.isLiked(track) !== liked) lib.toggleLike(track)
    return true
  },
  queue: (): QueueItem[] => usePlayer.getState().queue.map((t) => ({ id: refKey(t.ref), title: t.title, artists: t.artists, artworkUrl: t.artworkUrl ?? null })),
  close: () => useUi.getState().closeNowPlaying(),
  fullscreen: () => {
    const ui = useUi.getState()
    ui.closePanel()
    ui.openNowPlaying()
  },
  closePanel: () => useUi.getState().closePanel(),
  // yt-dlp (desktop, user-installed) lets Lyra's background use the song's real music video without any API key
  video: window.vega
    ? {
        available: async () => (await window.vega!.ytdlp.status()).installed,
        search: async (q) => (await window.vega!.ytdlp.search(q, 6)).map((e) => ({ videoId: e.id, title: e.title, channel: e.channel, durationSec: e.durationSec })),
        url: async (id) => toStreamUrl(await window.vega!.ytdlp.video(id, 1080))
      }
    : undefined,
  // Apple's preview CDN allows cross-origin reads (CORS *), so clips can be played and sampled directly
  clipUrl: (url) => url
}

declare global {
  interface Window {
    __vegaHost?: VegaHost
  }
}

window.__vegaHost = vegaHost
