import type { SearchResult, Shelf, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * Internet Archive: netlabels, 78rpm records, live recordings, open audio. No key, CORS-open.
 * Items (albums/recordings) are searched first, then their file lists are expanded into tracks.
 * Track id = "<identifier>/<filename>".
 */

interface IaDoc {
  identifier: string
  title?: string
  creator?: string | string[]
  year?: number | string
}

interface IaFile {
  name: string
  format?: string
  title?: string
  length?: string
  artist?: string
  creator?: string
  album?: string
  track?: string
}

interface IaMeta {
  metadata?: { title?: string; creator?: string | string[]; year?: string; date?: string }
  files?: IaFile[]
}

export interface ArchiveOptions {
  base?: string
  fetchImpl?: typeof fetch
  /** Items expanded per search; each item can yield several tracks. */
  itemsPerSearch?: number
  tracksPerItem?: number
}

const MUSIC_COLLECTIONS = 'collection:(netlabels OR audio_music OR opensource_audio OR 78rpm OR etree)'
const MP3_FORMATS = ['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3']

/** Lucene query text must not contain operators the user did not mean. */
const sanitize = (q: string): string =>
  q
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\b(AND|OR|NOT|TO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

export function parseLength(len: string | undefined): number {
  if (!len) return 0
  if (len.includes(':')) return len.split(':').reduce((n, p) => n * 60 + Number(p), 0)
  const n = Number(len)
  return Number.isFinite(n) ? n : 0
}

export function createArchiveProvider(opts: ArchiveOptions = {}): SourceProvider {
  const base = (opts.base ?? 'https://archive.org').replace(/\/$/, '')
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))
  const itemsPerSearch = opts.itemsPerSearch ?? 6
  const tracksPerItem = opts.tracksPerItem ?? 12
  const metaCache = new Map<string, Promise<IaMeta>>()

  async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
    const res = await doFetch(url, { signal })
    if (!res.ok) throw new Error(`Internet Archive ${res.status}`)
    return (await res.json()) as T
  }

  function metadata(id: string, signal?: AbortSignal): Promise<IaMeta> {
    let p = metaCache.get(id)
    if (!p) {
      p = json<IaMeta>(`${base}/metadata/${encodeURIComponent(id)}`, signal)
      metaCache.set(id, p)
      p.catch(() => metaCache.delete(id)) // do not cache failures
      if (metaCache.size > 60) metaCache.delete(metaCache.keys().next().value!)
    }
    return p
  }

  async function searchItems(q: string, rows: number, signal?: AbortSignal): Promise<IaDoc[]> {
    const text = sanitize(q)
    const query = `mediatype:audio AND ${MUSIC_COLLECTIONS}${text ? ` AND (${text})` : ''}`
    const params = new URLSearchParams({ q: query, rows: String(rows), output: 'json', 'sort[]': 'downloads desc' })
    for (const f of ['identifier', 'title', 'creator', 'year']) params.append('fl[]', f)
    const body = await json<{ response: { docs: IaDoc[] } }>(`${base}/advancedsearch.php?${params}`, signal)
    return body.response.docs
  }

  function tracksOf(id: string, meta: IaMeta): Track[] {
    const files = meta.files ?? []
    // pick the best MP3 flavour present, so one recording is not listed twice (e.g. VBR + 64Kbps)
    const fmt = MP3_FORMATS.find((f) => files.some((x) => x.format === f))
    if (!fmt) return []
    const itemCreator = first(meta.metadata?.creator)
    const yearStr = meta.metadata?.year ?? meta.metadata?.date?.slice(0, 4)
    const year = yearStr ? Number(yearStr) : NaN
    return files
      .filter((f) => f.format === fmt)
      .slice(0, tracksPerItem)
      .map((f): Track => ({
        ref: { source: 'archive', id: `${id}/${f.name}` },
        title: f.title?.trim() || f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
        artists: [f.artist?.trim() || f.creator?.trim() || itemCreator || 'Unknown artist'],
        album: f.album?.trim() || meta.metadata?.title,
        durationMs: Math.round(parseLength(f.length) * 1000),
        year: Number.isFinite(year) && year > 1800 ? year : undefined,
      }))
      .filter((t) => t.durationMs > 0)
  }

  async function expand(docs: IaDoc[], signal?: AbortSignal): Promise<Track[]> {
    const settled = await Promise.allSettled(docs.map(async (d) => tracksOf(d.identifier, await metadata(d.identifier, signal))))
    return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }

  const split = (id: string): [string, string] => {
    const i = id.indexOf('/')
    return [id.slice(0, i), id.slice(i + 1)]
  }

  return {
    id: 'archive',
    name: 'Internet Archive',
    capabilities: { search: true, browse: true, download: false, needsKey: false },

    async health() {
      try {
        await json(`${base}/advancedsearch.php?q=mediatype%3Aaudio&rows=1&output=json`)
        return 'ok'
      } catch {
        return 'down'
      }
    },

    async search(q, { limit, signal }): Promise<SearchResult> {
      if (!sanitize(q)) return { tracks: [] }
      const docs = await searchItems(q, itemsPerSearch, signal)
      return { tracks: (await expand(docs, signal)).slice(0, limit) }
    },

    async getTrack(id) {
      const [item] = split(id)
      return tracksOf(item, await metadata(item)).find((t) => t.ref.id === id) ?? null
    },

    async resolve(id) {
      const [item, file] = split(id)
      if (!item || !file) throw new Error('bad Internet Archive id')
      // /download redirects to the storage node holding the item
      return { kind: 'url', url: `${base}/download/${encodeURIComponent(item)}/${file.split('/').map(encodeURIComponent).join('/')}`, mime: 'audio/mpeg' }
    },

    async browse(): Promise<Shelf[]> {
      const docs = await searchItems('', 4)
      const tracks = (await expand(docs)).slice(0, 15)
      if (!tracks.length) throw new Error('Internet Archive unavailable')
      return [{ id: 'archive-popular', title: 'Popular on the Internet Archive', tracks }]
    }
  }
}
