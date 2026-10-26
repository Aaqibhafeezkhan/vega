import { create } from 'zustand'
import type { Track } from '@shared/types'
import { createLastFm } from '@providers/metadata/lastfm'
import { createMusicBrainz } from '@providers/metadata/musicbrainz'
import { load, save } from '@/lib/persist'

const mb = createMusicBrainz()
const norm = (s: string): string => s.trim().toLowerCase()
const MAX_QUEUE = 60
const RETRY_AFTER_MS = 6 * 3_600_000

interface MetaState {
  /** artist (lowercase) -> genres learned from MusicBrainz; [] = looked up, nothing found */
  artistGenres: Record<string, string[]>
  /** artist (lowercase) -> similar artists (lowercase) from Last.fm */
  similar: Record<string, string[]>
  enrich: boolean
  lastfmKey: string
  pending: number
  genresFor: (t: Track) => string[]
  request: (tracks: Track[]) => void
  similarTo: (artist: string) => Promise<string[]>
  setEnrich: (on: boolean) => void
  setLastfmKey: (k: string) => void
}

const queue: string[] = []
const failedAt = new Map<string, number>()
let draining = false

export const useMeta = create<MetaState>((set, get) => {
  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      while (queue.length && get().enrich) {
        const artist = queue.shift()!
        set({ pending: queue.length })
        if (get().artistGenres[artist]) continue
        try {
          const genres = await mb.artistGenres(artist)
          const next = { ...get().artistGenres, [artist]: genres }
          set({ artistGenres: next })
          save('meta.artistGenres', next)
        } catch {
          failedAt.set(artist, Date.now()) // network/rate limit: try again later, do not cache as "unknown"
        }
      }
    } finally {
      draining = false
      set({ pending: queue.length })
    }
  }

  return {
    artistGenres: load<Record<string, string[]>>('meta.artistGenres', {}),
    similar: load<Record<string, string[]>>('meta.similar', {}),
    enrich: load<boolean>('meta.enrich', true),
    lastfmKey: load<string>('meta.lastfmKey', ''),
    pending: 0,

    genresFor: (t) => {
      if (t.genres?.length) return t.genres
      const g = get().artistGenres[norm(t.artists[0] ?? '')]
      return g ?? []
    },

    request: (tracks) => {
      if (!get().enrich) return
      const known = get().artistGenres
      for (const t of tracks) {
        if (t.genres?.length || t.ref.source === 'mock') continue
        const a = norm(t.artists[0] ?? '')
        if (!a || a === 'unknown artist' || a === 'unknown' || known[a] || queue.includes(a)) continue
        if (Date.now() - (failedAt.get(a) ?? 0) < RETRY_AFTER_MS) continue
        if (queue.length >= MAX_QUEUE) break
        queue.push(a)
      }
      set({ pending: queue.length })
      void drain()
    },

    similarTo: async (artist) => {
      const key = get().lastfmKey
      const a = norm(artist)
      if (!key) return []
      const cached = get().similar[a]
      if (cached) return cached
      try {
        const names = (await createLastFm({ apiKey: key }).similarArtists(artist)).map(norm)
        const next = { ...get().similar, [a]: names }
        set({ similar: next })
        save('meta.similar', next)
        return names
      } catch {
        return []
      }
    },

    setEnrich: (enrich) => {
      save('meta.enrich', enrich)
      set({ enrich })
      if (enrich) void drain()
    },

    setLastfmKey: (k) => {
      const lastfmKey = k.trim()
      save('meta.lastfmKey', lastfmKey)
      set({ lastfmKey })
    }
  }
})
