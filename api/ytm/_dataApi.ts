import type { YtmSong } from '../../src/main/ytmusic'

/** Fallback search through the official YouTube Data API v3 (needs YT_API_KEY on the server; 100 + 1 quota units per search). */
const iso = (d: string): number => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
}

const clean = (s: string): string => s.replace(/&amp;|&#39;|&quot;/g, (e) => ({ '&amp;': '&', '&#39;': "'", '&quot;': '"' })[e]!)

interface SearchItem { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> } }
interface VideoItem { id: string; contentDetails: { duration: string } }

export function mapDataApi(search: { items?: SearchItem[] }, videos: { items?: VideoItem[] }): YtmSong[] {
  const dur = new Map((videos.items ?? []).map((v) => [v.id, iso(v.contentDetails.duration)]))
  const out: YtmSong[] = []
  for (const it of search.items ?? []) {
    const durationSec = dur.get(it.id.videoId) ?? 0
    if (!durationSec || durationSec > 3 * 3600) continue
    const t = it.snippet.thumbnails
    out.push({
      videoId: it.id.videoId,
      title: clean(it.snippet.title),
      artists: [clean(it.snippet.channelTitle).replace(/ - Topic$/, '')],
      durationSec,
      thumbnail: (t.high ?? t.medium ?? t.default)?.url
    })
  }
  return out
}

export async function dataApiSearch(q: string, limit: number, key: string, fetchImpl: typeof fetch = fetch): Promise<YtmSong[]> {
  const s = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&regionCode=IN&maxResults=${Math.min(limit, 25)}&q=${encodeURIComponent(q)}&key=${key}`)
  if (!s.ok) throw new Error(`data api ${s.status}`)
  const search = (await s.json()) as { items?: SearchItem[] }
  const ids = (search.items ?? []).map((i) => i.id.videoId).join(',')
  if (!ids) return []
  const v = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${key}`)
  return mapDataApi(search, v.ok ? ((await v.json()) as { items?: VideoItem[] }) : {})
}
