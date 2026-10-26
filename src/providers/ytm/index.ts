import type { VegaDesktopApi } from '@shared/ipc'
import type { SearchResult, Shelf, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * YouTube Music catalogue (desktop): fast search through the main process, playback resolved by the bundled yt-dlp.
 * This is Vega's main source for Hindi, Punjabi, Tamil, Telugu and international music. Resolved stream URLs are cached
 * and the next track is resolved ahead of time, so skipping feels instant.
 */

interface Song {
  videoId: string
  title: string
  artists: string[]
  album?: string
  durationSec: number
  thumbnail?: string
}

/** Home shelves: (title, search). India-first, with a global one. Run in parallel and cached by the main process. */
export const YTM_SHELVES: { id: string; title: string; query: string }[] = [
  { id: 'ytm-hindi', title: 'Trending Hindi', query: 'trending hindi songs' },
  { id: 'ytm-bolly', title: 'Bollywood romance', query: 'bollywood romantic songs' },
  { id: 'ytm-punjabi', title: 'Punjabi hits', query: 'latest punjabi songs' },
  { id: 'ytm-tamil', title: 'Tamil hits', query: 'latest tamil songs' },
  { id: 'ytm-telugu', title: 'Telugu hits', query: 'latest telugu songs' },
  { id: 'ytm-lofi', title: 'Hindi lo-fi chill', query: 'hindi lofi songs' },
  { id: 'ytm-global', title: 'Global top hits', query: 'top global hits' }
]

export function createYtmProvider(api: Pick<VegaDesktopApi, 'ytm' | 'ytdlp'>): SourceProvider {
  const toTrack = (s: Song): Track => ({
    ref: { source: 'ytm', id: s.videoId },
    title: s.title,
    artists: s.artists,
    album: s.album,
    durationMs: s.durationSec * 1000,
    artworkUrl: s.thumbnail
  })

  /** Fast catalogue search; if that endpoint is down, fall back to yt-dlp's own (slower) search. */
  async function find(q: string, limit: number): Promise<Track[]> {
    try {
      return (await api.ytm.search(q, limit)).map(toTrack)
    } catch {
      return (await api.ytdlp.search(q, Math.min(limit, 10)))
        .map((e) => ({ videoId: e.id, title: e.title, artists: [e.channel.replace(/ - Topic$/, '')], durationSec: e.durationSec, thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` }))
        .map(toTrack)
    }
  }

  return {
    id: 'ytm',
    name: 'YouTube Music',
    capabilities: { search: true, browse: true, download: false, needsKey: false },
    async health() {
      try {
        return (await api.ytm.search('a', 1)).length ? 'ok' : 'degraded'
      } catch {
        return 'degraded'
      }
    },
    async search(q, { limit }): Promise<SearchResult> {
      return { tracks: q.trim() ? await find(q, limit) : [] }
    },
    async getTrack() {
      return null
    },
    async resolve(id) {
      return { kind: 'url', url: await api.ytdlp.resolve(id), mime: 'audio/mp4' }
    },
    warm(id) {
      void api.ytdlp.warm(id)
    },
    async browse(): Promise<Shelf[]> {
      const rows = await Promise.allSettled(YTM_SHELVES.map((s) => api.ytm.search(s.query, 16)))
      const shelves: Shelf[] = []
      rows.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.length) shelves.push({ id: YTM_SHELVES[i]!.id, title: YTM_SHELVES[i]!.title, tracks: r.value.map(toTrack) })
      })
      if (!shelves.length) throw new Error('YouTube Music unavailable')
      return shelves
    }
  }
}
