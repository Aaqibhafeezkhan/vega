/**
 * YouTube Music catalogue search, the same public web endpoint the music.youtube.com site calls for its search box.
 * It returns clean song metadata (title, artists, album, duration, cover) for the whole YouTube Music library, which is
 * how Vega finds Hindi, Punjabi, Tamil, Telugu and every other kind of music quickly (~0.5 s). Playback is resolved
 * separately by yt-dlp (see ytdlp.ts). If this endpoint changes or fails, callers fall back to yt-dlp's own search.
 */

export interface YtmSong {
  videoId: string
  title: string
  artists: string[]
  album?: string
  durationSec: number
  thumbnail?: string
}

const ENDPOINT = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'
const FILTERS = { songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D', videos: 'EgWKAQIQAWoKEAkQBRAKEAMQBA%3D%3D' } as const
export type YtmKind = keyof typeof FILTERS
const WEB_CLIENT = { clientName: 'WEB_REMIX', clientVersion: '1.20241023.01.00' }

type Run = { text?: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }

const isDuration = (s: string): boolean => /^\d{1,2}(:\d{2}){1,2}$/.test(s.trim())
const toSeconds = (s: string): number => s.trim().split(':').reduce((n, p) => n * 60 + Number(p), 0)
const isSeparator = (t: string): boolean => /^\s*[•·•�]\s*$/.test(t)

/** `=w60-h60-l90-rj` style size suffixes: ask for a sharper cover. */
export const bigCover = (url: string, px = 544): string => url.replace(/=w\d+-h\d+[^/]*$/, `=w${px}-h${px}-l90-rj`)

interface Item {
  playlistItemData?: { videoId?: string }
  flexColumns?: Array<{ musicResponsiveListItemFlexColumnRenderer?: { text?: { runs?: Run[] } } }>
  thumbnail?: { musicThumbnailRenderer?: { thumbnail?: { thumbnails?: Array<{ url: string; width?: number }> } } }
}

function* items(node: unknown): Generator<Item> {
  if (Array.isArray(node)) {
    for (const n of node) yield* items(n)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'musicResponsiveListItemRenderer') yield v as Item
      else yield* items(v)
    }
  }
}

/** Pure parser (unit-tested against a recorded response). Rows without a playable video id are dropped. */
export function parseSongs(json: unknown): YtmSong[] {
  const out: YtmSong[] = []
  for (const it of items(json)) {
    const videoId = it.playlistItemData?.videoId
    const cols = it.flexColumns ?? []
    const title = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r) => r.text ?? '').join('').trim()
    const runs = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []
    if (!videoId || !title || !runs.length) continue

    // runs look like: artist , artist & artist • album • 4:03   (artists carry a UC… browse id)
    const durationRun = [...runs].reverse().find((r) => isDuration(r.text ?? ''))
    const durationSec = durationRun ? toSeconds(durationRun.text!) : 0
    if (!durationSec || durationSec > 3 * 3600) continue
    const groups: Run[][] = [[]]
    for (const r of runs) {
      if (r === durationRun) continue
      if (isSeparator(r.text ?? '')) groups.push([])
      else groups[groups.length - 1]!.push(r)
    }
    const linked = (groups[0] ?? []).filter((r) => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC'))
    const artists = (linked.length ? linked : (groups[0] ?? []).filter((r) => !/^\s*(,|&)\s*$/.test(r.text ?? ''))).map((r) => (r.text ?? '').trim()).filter(Boolean)
    const album = (groups[1] ?? []).map((r) => r.text ?? '').join('').trim() || undefined
    const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? []
    const thumb = thumbs[thumbs.length - 1]?.url

    out.push({ videoId, title, artists: artists.length ? artists : ['Unknown artist'], album, durationSec, thumbnail: thumb ? bigCover(thumb) : undefined })
  }
  return out
}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<Response>

export class YtMusic {
  private cache = new Map<string, { at: number; songs: YtmSong[] }>()

  constructor(
    private readonly fetchImpl: Fetcher,
    private readonly now: () => number = Date.now,
    /** ISO country: biases results toward that market (India by default: the app's main audience). */
    private region = 'IN'
  ) {}

  setRegion(r: string): void {
    this.region = /^[A-Z]{2}$/.test(r) ? r : 'IN'
    this.cache.clear()
  }

  async search(query: string, limit = 20, kind: YtmKind = 'songs', signal?: AbortSignal): Promise<YtmSong[]> {
    const q = query.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120)
    if (!q) return []
    const key = `${kind}|${this.region}|${q.toLowerCase()}`
    const hit = this.cache.get(key)
    if (hit && this.now() - hit.at < 30 * 60_000) return hit.songs.slice(0, limit)

    const res = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com' },
      body: JSON.stringify({ context: { client: { ...WEB_CLIENT, hl: 'en', gl: this.region } }, query: q, params: FILTERS[kind] }),
      signal
    })
    if (!res.ok) throw new Error(`YouTube Music search ${res.status}`)
    const songs = parseSongs(await res.json())
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(key, { at: this.now(), songs })
    return songs.slice(0, limit)
  }
}
