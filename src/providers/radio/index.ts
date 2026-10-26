import type { SearchResult, Shelf, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * Live internet radio via radio-browser.info (community directory, free, no key, CORS-open).
 * Stations are Tracks with durationMs 0 ("live"). Only https streams are offered so they play on the https web app too.
 * Not part of global song search; the Radio view queries it directly (`stations`).
 */

interface Station {
  stationuuid: string
  name: string
  url_resolved?: string
  tags?: string
  country?: string
  favicon?: string
  codec?: string
  bitrate?: number
  lastcheckok?: number
  clickcount?: number
}

export interface RadioOptions {
  fetchImpl?: typeof fetch
  mirrors?: string[]
}

const MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info']
const titleCase = (s: string): string => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())

export const RADIO_GENRES = ['pop', 'rock', 'jazz', 'lofi', 'electronic', 'classical', 'hip hop', 'ambient', 'news', 'country', 'reggae', 'metal'] as const

export function createRadioProvider(opts: RadioOptions = {}): SourceProvider & { stations(params: { name?: string; tag?: string; limit?: number; signal?: AbortSignal }): Promise<Track[]> } {
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))
  const mirrors = opts.mirrors ?? MIRRORS
  let good = 0 // index of the last mirror that worked

  async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let lastErr: unknown
    for (let n = 0; n < mirrors.length; n++) {
      const i = (good + n) % mirrors.length
      try {
        const res = await doFetch(`${mirrors[i]}${path}`, { signal })
        if (!res.ok) throw new Error(`radio-browser ${res.status}`)
        good = i
        return (await res.json()) as T
      } catch (e) {
        if (signal?.aborted) throw e
        lastErr = e
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('radio-browser unreachable')
  }

  const secure = (u: string | undefined): u is string => !!u && u.startsWith('https://')

  const toTrack = (s: Station): Track => ({
    ref: { source: 'radio', id: s.stationuuid },
    title: s.name.trim(),
    artists: [s.country?.trim() || 'Live radio'],
    album: `Live radio${s.bitrate ? ` · ${s.bitrate} kbps` : ''}`,
    durationMs: 0,
    genres: s.tags ? s.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2).map(titleCase) : undefined,
    artworkUrl: secure(s.favicon) ? s.favicon : undefined
  })

  async function stations(params: { name?: string; tag?: string; limit?: number; signal?: AbortSignal }): Promise<Track[]> {
    const qs = new URLSearchParams({
      limit: String(Math.min(60, params.limit ?? 24)),
      hidebroken: 'true',
      is_https: 'true',
      order: 'clickcount',
      reverse: 'true'
    })
    if (params.name) qs.set('name', params.name)
    if (params.tag) qs.set('tag', params.tag)
    const rows = await get<Station[]>(`/json/stations/search?${qs}`, params.signal)
    return rows.filter((s) => s.lastcheckok !== 0 && secure(s.url_resolved) && s.name?.trim()).map(toTrack)
  }

  return {
    id: 'radio',
    name: 'Live radio',
    capabilities: { search: false, browse: true, download: false, needsKey: false },
    stations,

    async health() {
      try {
        await get('/json/stats')
        return 'ok'
      } catch {
        return 'down'
      }
    },

    async search(q, { limit, signal }): Promise<SearchResult> {
      return { tracks: q.trim() ? await stations({ name: q, limit, signal }) : [] }
    },

    async getTrack(id) {
      const [s] = await get<Station[]>(`/json/stations/byuuid/${encodeURIComponent(id)}`)
      return s ? toTrack(s) : null
    },

    async resolve(id) {
      const [s] = await get<Station[]>(`/json/stations/byuuid/${encodeURIComponent(id)}`)
      if (!secure(s?.url_resolved)) throw new Error('Station has no secure stream')
      return { kind: 'url', url: s.url_resolved }
    },

    async browse(): Promise<Shelf[]> {
      const tracks = (await stations({ limit: 15 })).slice(0, 12)
      if (!tracks.length) throw new Error('Radio unavailable')
      return [{ id: 'radio-popular', title: 'Live radio', tracks }]
    }
  }
}
