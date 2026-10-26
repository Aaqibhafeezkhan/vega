import { create } from 'zustand'
import { refKey, type PlayEvent, type Playlist, type Track } from '@shared/types'
import { eventId, type Versioned } from '@shared/sync'
import type { SmartPlaylist } from '@shared/smart'
import { useCatalog } from './catalog'
import { load, save } from '@/lib/persist'

const MAX_EVENTS = 5000
const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** Edit time per liked track; `del` marks an un-like so it can sync as a tombstone. */
type LikeMeta = Record<string, { at: number; del: boolean }>

interface LibraryState {
  liked: Track[]
  likedMeta: LikeMeta
  playlists: Playlist[]
  /** Deleted playlist id -> deletion time (tombstones for sync). */
  playlistTombs: Record<string, number>
  events: PlayEvent[]
  smart: SmartPlaylist[]
  smartTombs: Record<string, number>
  isLiked: (t: Track) => boolean
  toggleLike: (t: Track) => void
  createPlaylist: (name: string, tracks?: Track[]) => string
  renamePlaylist: (id: string, name: string) => void
  deletePlaylist: (id: string) => void
  addToPlaylist: (id: string, t: Track) => void
  removeFromPlaylist: (id: string, index: number) => void
  moveInPlaylist: (id: string, from: number, to: number) => void
  saveSmart: (p: Omit<SmartPlaylist, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => string
  deleteSmart: (id: string) => void
  logPlay: (e: PlayEvent) => void
  seedDemoHistory: () => void
  clearHistory: () => void
  /** Sync support */
  snapshotLikes: () => Versioned<Track>[]
  snapshotPlaylists: () => Versioned<Playlist>[]
  snapshotSmart: () => Versioned<SmartPlaylist>[]
  applyRemote: (r: { likes?: Versioned<Track>[]; playlists?: Versioned<Playlist>[]; smart?: Versioned<SmartPlaylist>[]; events?: PlayEvent[] }) => void
  wipeSynced: () => void
}

type Persisted = Pick<LibraryState, 'liked' | 'likedMeta' | 'playlists' | 'playlistTombs' | 'events' | 'smart' | 'smartTombs'>

const persistAll = (s: Persisted): void => {
  save('liked', s.liked)
  save('likedMeta', s.likedMeta)
  save('playlists', s.playlists)
  save('playlistTombs', s.playlistTombs)
  save('events', s.events)
  save('smart', s.smart)
  save('smartTombs', s.smartTombs)
}

const liked0 = load<Track[]>('liked', [])
// Data from before sync existed has no edit times: treat as edited "long ago" so any cloud edit wins.
const likedMeta0 = load<LikeMeta>('likedMeta', {})
for (const t of liked0) likedMeta0[refKey(t.ref)] ??= { at: 1, del: false }
const playlists0 = load<Playlist[]>('playlists', []).map((p) => ({ ...p, updatedAt: p.updatedAt ?? p.createdAt }))

export const useLibrary = create<LibraryState>((set, get) => {
  const commit = (patch: Partial<Persisted>): void => {
    set(patch)
    const { liked, likedMeta, playlists, playlistTombs, events, smart, smartTombs } = get()
    persistAll({ liked, likedMeta, playlists, playlistTombs, events, smart, smartTombs })
  }
  const touch = (id: string, f: (p: Playlist) => Playlist): void =>
    commit({ playlists: get().playlists.map((p) => (p.id === id ? { ...f(p), updatedAt: Date.now() } : p)) })

  return {
    liked: liked0,
    likedMeta: likedMeta0,
    playlists: playlists0,
    playlistTombs: load<Record<string, number>>('playlistTombs', {}),
    events: load<PlayEvent[]>('events', []),
    smart: load<SmartPlaylist[]>('smart', []),
    smartTombs: load<Record<string, number>>('smartTombs', {}),

    isLiked: (t) => get().liked.some((x) => refKey(x.ref) === refKey(t.ref)),

    toggleLike: (t) => {
      const k = refKey(t.ref)
      const was = get().liked.some((x) => refKey(x.ref) === k)
      commit({
        liked: was ? get().liked.filter((x) => refKey(x.ref) !== k) : [t, ...get().liked],
        likedMeta: { ...get().likedMeta, [k]: { at: Date.now(), del: was } }
      })
    },

    createPlaylist: (name, tracks = []) => {
      const now = Date.now()
      const p: Playlist = { id: uid(), name: name.trim() || 'New playlist', createdAt: now, updatedAt: now, tracks }
      commit({ playlists: [...get().playlists, p] })
      return p.id
    },

    renamePlaylist: (id, name) => touch(id, (p) => ({ ...p, name: name.trim() || p.name })),

    deletePlaylist: (id) =>
      commit({
        playlists: get().playlists.filter((p) => p.id !== id),
        playlistTombs: { ...get().playlistTombs, [id]: Date.now() }
      }),

    addToPlaylist: (id, t) =>
      touch(id, (p) => (p.tracks.some((x) => refKey(x.ref) === refKey(t.ref)) ? p : { ...p, tracks: [...p.tracks, t] })),

    removeFromPlaylist: (id, index) => touch(id, (p) => ({ ...p, tracks: p.tracks.filter((_, i) => i !== index) })),

    moveInPlaylist: (id, from, to) =>
      touch(id, (p) => {
        if (to < 0 || to >= p.tracks.length) return p
        const tracks = [...p.tracks]
        const [moved] = tracks.splice(from, 1)
        if (moved) tracks.splice(to, 0, moved)
        return { ...p, tracks }
      }),

    saveSmart: (p) => {
      const now = Date.now()
      const id = p.id ?? uid()
      const existing = get().smart.find((x) => x.id === id)
      const next: SmartPlaylist = { ...p, id, createdAt: existing?.createdAt ?? now, updatedAt: now }
      commit({ smart: existing ? get().smart.map((x) => (x.id === id ? next : x)) : [...get().smart, next] })
      return id
    },

    deleteSmart: (id) => commit({ smart: get().smart.filter((x) => x.id !== id), smartTombs: { ...get().smartTombs, [id]: Date.now() } }),

    logPlay: (e) => commit({ events: [...get().events, e].slice(-MAX_EVENTS) }),

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
        const startedAt = Math.round(now - day * 86_400_000 - (24 - hour) * 3_600_000 + Math.random() * 3_000_000)
        const skipped = Math.random() < (favs.has(t.artists[0] ?? '') ? 0.08 : 0.35)
        const listenedMs = Math.round(skipped ? 3000 + Math.random() * 12_000 : t.durationMs)
        evs.push({ track: t, startedAt, listenedMs, counted: !skipped, skipped })
      }
      const events = [...get().events, ...evs].slice(-MAX_EVENTS).sort((a, b) => a.startedAt - b.startedAt)
      commit({ events })
    },

    clearHistory: () => commit({ events: [] }),

    snapshotLikes: () =>
      get().liked.map((t) => ({ key: refKey(t.ref), at: get().likedMeta[refKey(t.ref)]?.at ?? 1, deleted: false, value: t })).concat(
        Object.entries(get().likedMeta)
          .filter(([, m]) => m.del)
          .map(([key, m]) => ({ key, at: m.at, deleted: true, value: get().liked.find((t) => refKey(t.ref) === key) ?? (null as unknown as Track) }))
      ),

    snapshotPlaylists: () =>
      get()
        .playlists.map((p) => ({ key: p.id, at: p.updatedAt ?? p.createdAt, deleted: false, value: p }))
        .concat(
          Object.entries(get().playlistTombs).map(([key, at]) => ({ key, at, deleted: true, value: null as unknown as Playlist }))
        ),

    snapshotSmart: () =>
      get()
        .smart.map((p) => ({ key: p.id, at: p.updatedAt, deleted: false, value: p }))
        .concat(Object.entries(get().smartTombs).map(([key, at]) => ({ key, at, deleted: true, value: null as unknown as SmartPlaylist }))),

    applyRemote: ({ likes, playlists, smart, events }) => {
      const patch: Partial<Persisted> = {}
      if (likes?.length) {
        const meta = { ...get().likedMeta }
        const map = new Map(get().liked.map((t) => [refKey(t.ref), t]))
        for (const v of likes) {
          meta[v.key] = { at: v.at, del: v.deleted }
          if (v.deleted) map.delete(v.key)
          else map.set(v.key, v.value)
        }
        // newest like first, matching toggleLike's prepend behaviour
        patch.liked = [...map.values()].sort((a, b) => (meta[refKey(b.ref)]?.at ?? 0) - (meta[refKey(a.ref)]?.at ?? 0))
        patch.likedMeta = meta
      }
      if (playlists?.length) {
        const byId = new Map(get().playlists.map((p) => [p.id, p]))
        const tombs = { ...get().playlistTombs }
        for (const v of playlists) {
          if (v.deleted) {
            byId.delete(v.key)
            tombs[v.key] = v.at
          } else {
            byId.set(v.key, { ...v.value, updatedAt: v.at })
            delete tombs[v.key]
          }
        }
        patch.playlists = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
        patch.playlistTombs = tombs
      }
      if (smart?.length) {
        const byId = new Map(get().smart.map((p) => [p.id, p]))
        const tombs = { ...get().smartTombs }
        for (const v of smart) {
          if (v.deleted) {
            byId.delete(v.key)
            tombs[v.key] = v.at
          } else {
            byId.set(v.key, { ...v.value, updatedAt: v.at })
            delete tombs[v.key]
          }
        }
        patch.smart = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
        patch.smartTombs = tombs
      }
      if (events?.length) {
        const known = new Set(get().events.map(eventId))
        const merged = [...get().events, ...events.filter((e) => !known.has(eventId(e)))].sort((a, b) => a.startedAt - b.startedAt)
        patch.events = merged.slice(-MAX_EVENTS)
      }
      if (Object.keys(patch).length) commit(patch)
    },

    /** Used when a different account signs in on this device: the previous account's data lives in the cloud already. */
    wipeSynced: () => commit({ liked: [], likedMeta: {}, playlists: [], playlistTombs: {}, events: [], smart: [], smartTombs: {} })
  }
})
