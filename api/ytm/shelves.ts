import { YTM_LANGUAGES, ytmShelves, type YtmLanguage } from '../../src/providers/ytm'
import { CACHE_SHELVES, json, ytm } from './_shared'

export async function GET(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get('lang') ?? 'Hindi'
  const lang = ((YTM_LANGUAGES as readonly string[]).includes(asked) ? asked : 'Hindi') as YtmLanguage
  const defs = ytmShelves(lang)
  const rows = await Promise.allSettled(defs.map((d) => ytm.search(d.query, 16)))
  const shelves = defs.map((d, i) => ({ id: d.id, title: d.title, songs: rows[i]!.status === 'fulfilled' ? rows[i]!.value : [] })).filter((s) => s.songs.length)
  if (!shelves.length) return json({ error: 'upstream' }, undefined, 502)
  return json({ shelves }, CACHE_SHELVES)
}
