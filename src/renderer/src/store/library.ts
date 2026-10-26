import { create } from 'zustand'
import { refKey, type PlayEvent, type Playlist, type Track } from '@shared/types'
import { useCatalog } from './catalog'
import { load, save } from '@/lib/persist'

const MAX_EVENTS = 5000
const uid = (): string => Math.random().toString(36).slice(2, 10)

interface LibraryState {
  liked: Track[]
  playlists: Playlist[]
  events: PlayEvent[]
  isLiked: (t: Track) => boolean
  toggleLike: (t: Track) => void
  createPlaylist: (name: string, tracks?: Track[]) => string
  renamePlaylist: (id: string, name: string) => void
  deletePlaylist: (id: string) => void
  addToPlaylist: (id: string, t: Track) => void
  removeFromPlaylist: (id: string, index: number) => void
  moveInPlaylist: (id: string, from: number, to: number) => void
  logPlay: (e: PlayEvent) => void
  seedDemoHistory: () => void
  clearHistory: () => void
}

const persistAll = (s: Pick<LibraryState, 'liked' | 'playlists' | 'events'>): void => {
  save('liked', s.liked)
  save('playlists', s.playlists)
  save('events', s.events)
}

export const useLibrary = create<LibraryState>((set, get) => ({
  liked: load<Track[]>('liked', []),
  playlists: load<Playlist[]>('playlists', []),
  events: load<PlayEvent[]>('events', []),

  isLiked: (t) => get().liked.some((x) => refKey(x.ref) === refKey(t.ref)),

  toggleLike: (t) => {
    const k = refKey(t.ref)
    const liked = get().liked.some((x) => refKey(x.ref) === k) ? get().liked.filter((x) => refKey(x.ref) !== k) : [t, ...get().liked]
    set({ liked })
    persistAll({ ...get(), liked })
  },

  createPlaylist: (name, tracks = []) => {
    const p: Playlist = { id: uid(), name: name.trim() || 'New playlist', createdAt: Date.now(), tracks }
    const playlists = [...get().playlists, p]
    set({ playlists })
    persistAll({ ...get(), playlists })
    return p.id
  },

  renamePlaylist: (id, name) => {
    const playlists = get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
    set({ playlists })
    persistAll({ ...get(), playlists })
  },

  deletePlaylist: (id) => {
    const playlists = get().playlists.filter((p) => p.id !== id)
    set({ playlists })
    persistAll({ ...get(), playlists })
  },

  addToPlaylist: (id, t) => {
    const playlists = get().playlists.map((p) =>
      p.id === id && !p.tracks.some((x) => refKey(x.ref) === refKey(t.ref)) ? { ...p, tracks: [...p.tracks, t] } : p
    )
    set({ playlists })
    persistAll({ ...get(), playlists })
  },

  removeFromPlaylist: (id, index) => {
    const playlists = get().playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((_, i) => i !== index) } : p))
    set({ playlists })
    persistAll({ ...get(), playlists })
  },

  moveInPlaylist: (id, from, to) => {
    const playlists = get().playlists.map((p) => {
      if (p.id !== id || to < 0 || to >= p.tracks.length) return p
      const tracks = [...p.tracks]
      const [moved] = tracks.splice(from, 1)
      if (moved) tracks.splice(to, 0, moved)
      return { ...p, tracks }
    })
    set({ playlists })
    persistAll({ ...get(), playlists })
  },

  logPlay: (e) => {
    const events = [...get().events, e].slice(-MAX_EVENTS)
    set({ events })
    persistAll({ ...get(), events })
  },

  /** Generate ~3 weeks of plausible taste-biased listening so stats and recs can be explored. */
  seedDemoHistory: () => {
    const catalog = useCatalog.getState().tracks
    if (!catalog.length) return
    const favs = new Set(['Nova Lumen', 'Selene & The Tides', 'Mika Ono'])
    const pool = catalog.flatMap((t) => (favs.has(t.artists[0] ?? '') ? [t, t, t] : [t]))
    const now = Date.now()
    const evs: PlayEvent[] = []
    for (let i = 0; i < 240; i++) {
      const t = pool[Math.floor(Math.random() * pool.length)]!
      const day = Math.floor(Math.random() * 21)
      const hour = Math.random() < 0.6 ? 20 + Math.floor(Math.random() * 4) : 9 + Math.floor(Math.random() * 10)
      const startedAt = now - day * 86_400_000 - (24 - hour) * 3_600_000 + Math.random() * 3_000_000
      const skipped = Math.random() < (favs.has(t.artists[0] ?? '') ? 0.08 : 0.35)
      const listenedMs = skipped ? 3000 + Math.random() * 12_000 : t.durationMs
      evs.push({ track: t, startedAt, listenedMs, counted: !skipped, skipped })
    }
    evs.sort((a, b) => a.startedAt - b.startedAt)
    const events = [...get().events, ...evs].slice(-MAX_EVENTS).sort((a, b) => a.startedAt - b.startedAt)
    set({ events })
    persistAll({ ...get(), events })
  },

  clearHistory: () => {
    set({ events: [] })
    persistAll({ ...get(), events: [] })
  }
}))
