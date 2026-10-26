import { create } from 'zustand'
import type { Track } from '@shared/types'
import { backend } from '@/lib/backend'
import { sources } from '@/lib/sources'
import { load, save } from '@/lib/persist'
import { useLibrary } from './library'

export type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: Track[]
  index: number
  playing: boolean
  loading: boolean
  error: string | null
  positionMs: number
  durationMs: number
  volume: number
  shuffle: boolean
  repeat: Repeat
  current: () => Track | null
  playTracks: (tracks: Track[], startIndex?: number) => void
  playIndex: (i: number) => void
  togglePlay: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (ms: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  enqueue: (t: Track) => void
  playNext: (t: Track) => void
  removeFromQueue: (i: number) => void
  clearQueue: () => void
}

const audio = new Audio()
audio.preload = 'auto'
// Desktop media (vega-media://) is served with CORS headers, which lets the equalizer's Web Audio graph read the stream.
if (window.vega) audio.crossOrigin = 'anonymous'

/** The single playback element (the equalizer attaches its Web Audio graph to it). */
export const getAudio = (): HTMLAudioElement => audio

/** Tracks what the user actually heard of the current track, for the analytics log. */
let session: { track: Track; startedAt: number; listenedMs: number; lastTick: number | null } | null = null

function finishSession(skipped: boolean): void {
  if (!session) return
  const { track, startedAt, listenedMs } = session
  session = null
  if (listenedMs < 1500) return // ignore accidental clicks
  const counted = listenedMs >= Math.min(30_000, track.durationMs * 0.5)
  useLibrary.getState().logPlay({ track, startedAt, listenedMs, counted, skipped: skipped && !counted })
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

let loadToken = 0

/** Live playback position in ms (the store value only updates on timeupdate, ~4 Hz). */
export const getPosition = (): number => audio.currentTime * 1000

export const usePlayer = create<PlayerState>((set, get) => {
  const startCurrent = async (): Promise<void> => {
    const track = get().queue[get().index]
    if (!track) return
    const token = ++loadToken
    set({ loading: true, error: null, positionMs: 0, durationMs: track.durationMs })
    try {
      const { stream } = await sources.resolve(track, get().queue)
      if (token !== loadToken) return
      if (stream.kind !== 'url') throw new Error('file streams need the stream proxy (M2)')
      audio.src = backend.proxyStream?.(stream.url) ?? stream.url
      await audio.play()
      if (token !== loadToken) return
      session = { track, startedAt: Date.now(), listenedMs: 0, lastTick: null }
      set({ loading: false, playing: true })
      updateMediaSession(track)
    } catch (err) {
      if (token !== loadToken) return
      console.warn('playback failed', err)
      set({ loading: false, playing: false, error: `Can't play "${track.title}"` })
      // skip forward after a failure so a dead track doesn't stall the queue
      if (get().queue.length > 1) setTimeout(() => token === loadToken && get().next(true), 1200)
    }
  }

  audio.addEventListener('timeupdate', () => {
    const now = performance.now()
    if (session) {
      if (session.lastTick !== null) session.listenedMs += Math.min(1000, now - session.lastTick)
      session.lastTick = now
    }
    set({ positionMs: audio.currentTime * 1000 })
  })
  audio.addEventListener('pause', () => {
    if (session) session.lastTick = null
    set({ playing: false })
  })
  audio.addEventListener('play', () => set({ playing: true }))
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration)) set({ durationMs: audio.duration * 1000 })
  })
  audio.addEventListener('error', () => {
    // stream died after resolve (expired url, offline, bad file): report and move on
    const track = get().queue[get().index]
    if (!track || !audio.src) return
    const token = loadToken
    set({ loading: false, playing: false, error: `Can't play "${track.title}"` })
    if (get().queue.length > 1) setTimeout(() => token === loadToken && get().next(true), 1200)
  })
  audio.addEventListener('ended', () => {
    finishSession(false)
    get().next(true)
  })

  audio.volume = load<number>('volume', 0.8)

  return {
    queue: [],
    index: -1,
    playing: false,
    loading: false,
    error: null,
    positionMs: 0,
    durationMs: 0,
    volume: audio.volume,
    shuffle: false,
    repeat: 'off',

    current: () => get().queue[get().index] ?? null,

    playTracks: (tracks, startIndex = 0) => {
      if (!tracks.length) return
      finishSession(true)
      let queue = tracks
      let index = startIndex
      if (get().shuffle) {
        const first = tracks[startIndex]!
        queue = [first, ...shuffled(tracks.filter((_, i) => i !== startIndex))]
        index = 0
      }
      set({ queue, index })
      void startCurrent()
    },

    playIndex: (i) => {
      if (i < 0 || i >= get().queue.length) return
      finishSession(true)
      set({ index: i })
      void startCurrent()
    },

    togglePlay: () => {
      if (audio.src && !audio.ended && get().index >= 0) {
        if (audio.paused) void audio.play()
        else audio.pause()
      } else if (get().queue.length) {
        get().playIndex(Math.max(0, get().index))
      }
    },

    next: (auto = false) => {
      const { queue, index, repeat } = get()
      if (!queue.length) return
      if (auto && repeat === 'one') {
        set({ index })
        void startCurrent()
        return
      }
      const last = index >= queue.length - 1
      if (last && repeat !== 'all') {
        if (!auto) return
        audio.pause()
        audio.currentTime = 0
        set({ playing: false, positionMs: 0 })
        return
      }
      if (!auto) finishSession(true)
      set({ index: last ? 0 : index + 1 })
      void startCurrent()
    },

    prev: () => {
      if (audio.currentTime > 3 || get().index <= 0) {
        audio.currentTime = 0
        return
      }
      finishSession(true)
      set({ index: get().index - 1 })
      void startCurrent()
    },

    seek: (ms) => {
      audio.currentTime = ms / 1000
      set({ positionMs: ms })
    },

    setVolume: (v) => {
      audio.volume = v
      set({ volume: v })
      save('volume', v)
    },

    toggleShuffle: () => {
      const { shuffle, queue, index } = get()
      if (!shuffle && queue.length > 2) {
        const upcoming = shuffled(queue.slice(index + 1))
        set({ queue: [...queue.slice(0, index + 1), ...upcoming] })
      }
      set({ shuffle: !shuffle })
    },

    cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

    enqueue: (t) => {
      if (!get().queue.length) return get().playTracks([t])
      set((s) => ({ queue: [...s.queue, t] }))
    },

    playNext: (t) => {
      if (!get().queue.length) return get().playTracks([t])
      set((s) => ({ queue: [...s.queue.slice(0, s.index + 1), t, ...s.queue.slice(s.index + 1)] }))
    },

    removeFromQueue: (i) => {
      const { queue, index } = get()
      if (i === index) return
      set({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index })
    },

    clearQueue: () => {
      const cur = get().queue[get().index]
      set({ queue: cur ? [cur] : [], index: cur ? 0 : -1 })
    }
  }
})

function updateMediaSession(t: Track): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artists.join(', '), album: t.album ?? '' })
  const p = usePlayer.getState()
  navigator.mediaSession.setActionHandler('play', () => p.togglePlay())
  navigator.mediaSession.setActionHandler('pause', () => p.togglePlay())
  navigator.mediaSession.setActionHandler('nexttrack', () => usePlayer.getState().next())
  navigator.mediaSession.setActionHandler('previoustrack', () => usePlayer.getState().prev())
}

