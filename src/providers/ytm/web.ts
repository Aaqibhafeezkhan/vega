import type { SearchResult, Shelf, SourceProvider } from '@shared/provider'
import { getYtmLanguage, songToTrack, type Song } from './index'

/**
 * YouTube Music on the web. The browser can't call YouTube directly (CORS) and there is no yt-dlp, so search and shelves
 * go through Vega's own /api/ytm functions (edge-cached), and playback uses YouTube's embedded player.
 * Track refs use the same `ytm` source and video ids as desktop, so synced libraries play on both.
 */
export function createYtmWebProvider(base = '/api/ytm', fetchImpl: typeof fetch = (...a) => fetch(...a)): SourceProvider {
  async function json<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetchImpl(`${base}/${path}`, { signal })
    if (!res.ok) throw new Error(`ytm api ${res.status}`)
    return (await res.json()) as T
  }

  return {
    id: 'ytm',
    name: 'YouTube Music',
    capabilities: { search: true, browse: true, download: false, needsKey: false },
    async health() {
      try {
        const r = await json<{ songs: Song[] }>('search?q=a&limit=1')
        return r.songs.length ? 'ok' : 'degraded'
      } catch {
        return 'degraded'
      }
    },
    async search(q, { limit, signal }): Promise<SearchResult> {
      if (!q.trim()) return { tracks: [] }
      const r = await json<{ songs: Song[] }>(`search?q=${encodeURIComponent(q)}&limit=${limit}`, signal)
      return { tracks: r.songs.map(songToTrack) }
    },
    async getTrack() {
      return null
    },
    async resolve(id) {
      return { kind: 'embed', provider: 'youtube', videoId: id }
    },
    async browse(): Promise<Shelf[]> {
      const r = await json<{ shelves: { id: string; title: string; songs: Song[] }[] }>(`shelves?lang=${encodeURIComponent(getYtmLanguage())}`)
      const shelves = r.shelves.filter((s) => s.songs.length).map((s) => ({ id: s.id, title: s.title, tracks: s.songs.map(songToTrack) }))
      if (!shelves.length) throw new Error('YouTube Music unavailable')
      return shelves
    }
  }
}
