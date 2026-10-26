import type { VegaDesktopApi } from '@shared/ipc'
import type { SearchResult, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * YouTube through the user's own yt-dlp install (desktop only, opt-in). The main process runs yt-dlp; this provider
 * just maps its results to tracks and resolves a stream URL just in time.
 */
export function createYtDlpProvider(api: VegaDesktopApi['ytdlp']): SourceProvider {
  const toTrack = (e: { id: string; title: string; channel: string; durationSec: number }): Track => ({
    ref: { source: 'ytdlp', id: e.id },
    title: e.title,
    artists: [e.channel.replace(/ - Topic$/, '')],
    durationMs: e.durationSec * 1000,
    artworkUrl: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`
  })

  return {
    id: 'ytdlp',
    name: 'YouTube (yt-dlp)',
    capabilities: { search: true, browse: false, download: false, needsKey: false },
    async health() {
      return (await api.status()).installed ? 'ok' : 'down'
    },
    async search(q, { limit }): Promise<SearchResult> {
      if (!q.trim()) return { tracks: [] }
      return { tracks: (await api.search(q, Math.min(limit, 12))).map(toTrack) }
    },
    async getTrack() {
      return null
    },
    async resolve(id) {
      return { kind: 'url', url: await api.resolve(id) }
    }
  }
}
