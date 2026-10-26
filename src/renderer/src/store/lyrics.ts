import { create } from 'zustand'
import { refKey, type LyricsResult, type Track } from '@shared/types'
import { fetchLyrics } from '@/lib/lyrics'
import { load, save } from '@/lib/persist'

type State = { phase: 'idle' } | { phase: 'loading'; key: string } | { phase: 'ready'; result: LyricsResult }

interface LyricsStore {
  state: State
  /** Per-song timing offsets in ms (remembered). Positive shows lyrics earlier. */
  offsets: Record<string, number>
  wordByWord: boolean
  romanize: boolean
  ensure: (track: Track | null) => void
  retry: (track: Track | null) => void
  nudge: (track: Track, deltaMs: number) => void
  setWordByWord: (on: boolean) => void
  setRomanize: (on: boolean) => void
}

export const OFFSET_STEP_MS = 250

let ctl: AbortController | null = null
let currentKey = ''

export const useLyrics = create<LyricsStore>((set, get) => {
  const run = (track: Track, force: boolean): void => {
    const key = refKey(track.ref)
    ctl?.abort()
    ctl = new AbortController()
    const mine = ctl
    currentKey = key
    set({ state: { phase: 'loading', key } })
    fetchLyrics(track, mine.signal, force)
      .then((result) => {
        if (!mine.signal.aborted && currentKey === key) set({ state: { phase: 'ready', result } })
      })
      .catch(() => {})
  }

  return {
    state: { phase: 'idle' },
    offsets: load<Record<string, number>>('lyrics.offsets', {}),
    wordByWord: load<boolean>('lyrics.wordByWord', true),
    romanize: load<boolean>('lyrics.romanize', false),

    ensure: (track) => {
      if (!track) {
        ctl?.abort()
        currentKey = ''
        set({ state: { phase: 'idle' } })
        return
      }
      const key = refKey(track.ref)
      const s = get().state
      if (key === currentKey && s.phase !== 'idle') return // already loaded or loading for this track
      run(track, false)
    },

    retry: (track) => track && run(track, true),

    nudge: (track, deltaMs) => {
      const key = refKey(track.ref)
      const next = { ...get().offsets, [key]: (get().offsets[key] ?? 0) + deltaMs }
      if (next[key] === 0) delete next[key]
      set({ offsets: next })
      save('lyrics.offsets', next)
    },

    setWordByWord: (wordByWord) => {
      save('lyrics.wordByWord', wordByWord)
      set({ wordByWord })
    },
    setRomanize: (romanize) => {
      save('lyrics.romanize', romanize)
      set({ romanize })
    }
  }
})
