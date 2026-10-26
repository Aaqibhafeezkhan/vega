import type { SearchResult, Shelf, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * Audius: open music network, public REST API, no key needed for reads (an app_name is requested by their docs).
 * https://api.audius.co/v1  - CORS is open, so this works from the browser as well as the desktop app.
 */

interface AudiusTrack {
  id: string
  title: string
  duration: number
  genre?: string | null
  release_date?: string | null
  isrc?: string | null
  is_streamable?: boolean
  is_delete?: boolean
  is_unlisted?: boolean
  is_available?: boolean
  access?: { stream?: boolean }
  artwork?: Record<string, string> | null
  user?: { name?: string; handle?: string; is_deactivated?: boolean }
}

export interface AudiusOptions {
  base?: string
  appName?: string
  fetchImpl?: typeof fetch
}

const GENRE_SHELVES = ['Electronic', 'Hip-Hop/Rap', 'Lo-Fi'] as const

export function createAudiusProvider(opts: AudiusOptions = {}): SourceProvider {
  const base = (opts.base ?? 'https://api.audius.co').replace(/\/$/, '')
  const appName = opts.appName ?? 'vega'
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))

  async function get<T>(path: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
    const qs = new URLSearchParams({ app_name: appName, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
    const res = await doFetch(`${base}/v1${path}?${qs}`, { signal })
    if (!res.ok) throw new Error(`Audius ${res.status}`)
    return ((await res.json()) as { data: T }).data
  }

  const playable = (t: AudiusTrack): boolean =>
    t.is_streamable !== false && t.access?.stream !== false && !t.is_delete && !t.is_unlisted && t.is_available !== false && !t.user?.is_deactivated && t.duration > 0

  const toTrack = (t: AudiusTrack): Track => ({
    ref: { source: 'audius', id: t.id },
    title: t.title,
    artists: [t.user?.name || t.user?.handle || 'Unknown artist'],
    durationMs: Math.round(t.duration * 1000),
    genres: t.genre ? [t.genre] : undefined,
    year: t.release_date ? new Date(t.release_date).getUTCFullYear() || undefined : undefined,
    isrc: t.isrc ?? undefined,
    artworkUrl: t.artwork?.['480x480'] ?? t.artwork?.['150x150'] ?? undefined
  })

  const list = (rows: AudiusTrack[]): Track[] => rows.filter(playable).map(toTrack)

  return {
    id: 'audius',
    name: 'Audius',
    capabilities: { search: true, browse: true, download: false, needsKey: false },

    async health() {
      try {
        const res = await doFetch(`${base}/v1/tracks/trending?app_name=${appName}&limit=1`)
        return res.ok ? 'ok' : 'degraded'
      } catch {
        return 'down'
      }
    },

    async search(q, { limit, signal }): Promise<SearchResult> {
      if (!q.trim()) return { tracks: [] }
      // over-fetch: some hits are gated/deactivated and get filtered out
      const rows = await get<AudiusTrack[]>('/tracks/search', { query: q, limit: Math.min(50, limit * 2) }, signal)
      return { tracks: list(rows).slice(0, limit) }
    },

    async getTrack(id) {
      const t = await get<AudiusTrack>(`/tracks/${encodeURIComponent(id)}`, {})
      return playable(t) ? toTrack(t) : null
    },

    async resolve(id) {
      // The endpoint 302-redirects to a healthy content node; <audio> follows it.
      return { kind: 'url', url: `${base}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${appName}`, mime: 'audio/mpeg' }
    },

    async browse(): Promise<Shelf[]> {
      const [trending, ...genres] = await Promise.allSettled([
        get<AudiusTrack[]>('/tracks/trending', { limit: 20, time: 'week' }),
        ...GENRE_SHELVES.map((g) => get<AudiusTrack[]>('/tracks/trending', { limit: 20, time: 'week', genre: g }))
      ])
      const shelves: Shelf[] = []
      if (trending.status === 'fulfilled') shelves.push({ id: 'audius-trending', title: 'Trending on Audius', tracks: list(trending.value).slice(0, 15) })
      genres.forEach((r, i) => {
        if (r.status === 'fulfilled') shelves.push({ id: `audius-${GENRE_SHELVES[i]}`, title: `${GENRE_SHELVES[i]!.replace('/Rap', '')} on Audius`, tracks: list(r.value).slice(0, 15) })
      })
      if (!shelves.length) throw new Error('Audius unavailable')
      return shelves.filter((s) => s.tracks.length)
    }
  }
}
