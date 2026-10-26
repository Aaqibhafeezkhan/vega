import type { SearchResult, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * YouTube via a Piped API instance (https://github.com/TeamPiped/Piped): no binary and no key, but public instances
 * come and go, so a list is tried in order and the first that answers is remembered. Desktop only (browsers block
 * arbitrary instances through CORS/CSP). Opt-in.
 */

interface PipedItem {
  url?: string
  title?: string
  uploaderName?: string
  duration?: number
  thumbnail?: string
}
interface PipedStream {
  url: string
  mimeType?: string
  bitrate?: number
  videoOnly?: boolean
}

export const DEFAULT_INSTANCES = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee']

const VIDEO_ID = /^[\w-]{11}$/

export interface PipedOptions {
  instances?: string[]
  fetchImpl?: typeof fetch
}

export function createPipedProvider(opts: PipedOptions = {}): SourceProvider {
  const instances = (opts.instances?.length ? opts.instances : DEFAULT_INSTANCES).map((u) => u.replace(/\/$/, '')).filter((u) => u.startsWith('https://'))
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))
  let good = 0

  async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let last: unknown = new Error('no Piped instance configured')
    for (let n = 0; n < instances.length; n++) {
      const i = (good + n) % instances.length
      try {
        const res = await doFetch(`${instances[i]}${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(`Piped ${res.status}`)
        good = i
        return (await res.json()) as T
      } catch (e) {
        if (signal?.aborted) throw e
        last = e
      }
    }
    throw last instanceof Error ? last : new Error('Piped unreachable')
  }

  const idOf = (u: string | undefined): string | null => {
    const id = u ? new URL(u, 'https://x.invalid').searchParams.get('v') : null
    return id && VIDEO_ID.test(id) ? id : null
  }

  return {
    id: 'piped',
    name: 'YouTube (Piped)',
    capabilities: { search: true, browse: false, download: false, needsKey: false },

    async health() {
      try {
        await get('/trending?region=US')
        return 'ok'
      } catch {
        return 'down'
      }
    },

    async search(q, { limit, signal }): Promise<SearchResult> {
      if (!q.trim()) return { tracks: [] }
      const r = await get<{ items?: PipedItem[] }>(`/search?q=${encodeURIComponent(q.slice(0, 120))}&filter=music_songs`, signal)
      const tracks: Track[] = []
      for (const it of r.items ?? []) {
        const id = idOf(it.url)
        if (!id || !it.title || !(it.duration && it.duration > 0)) continue
        tracks.push({
          ref: { source: 'piped', id },
          title: it.title,
          artists: [(it.uploaderName ?? 'YouTube').replace(/ - Topic$/, '')],
          durationMs: it.duration * 1000,
          artworkUrl: it.thumbnail?.startsWith('https://') ? it.thumbnail : undefined
        })
        if (tracks.length >= limit) break
      }
      return { tracks }
    },

    async getTrack() {
      return null
    },

    async resolve(id) {
      if (!VIDEO_ID.test(id)) throw new Error('bad video id')
      const r = await get<{ audioStreams?: PipedStream[] }>(`/streams/${id}`)
      const audio = (r.audioStreams ?? []).filter((s) => !s.videoOnly && s.url.startsWith('https://'))
      // m4a plays everywhere Chromium does; prefer it, highest bitrate first
      const best = [...audio].sort((a, b) => Number(b.mimeType?.includes('mp4') ?? false) - Number(a.mimeType?.includes('mp4') ?? false) || (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
      if (!best) throw new Error('No audio stream available')
      return { kind: 'url', url: best.url, mime: best.mimeType }
    }
  }
}
