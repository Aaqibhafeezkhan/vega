import { YTM_LANGUAGES, ytmShelves, type YtmLanguage } from '../../src/providers/ytm'
import { CACHE_SHELVES, node, ytm, type Result } from './_shared'

export async function run(url: URL): Promise<Result> {
  const asked = url.searchParams.get('lang') ?? 'Hindi'
  const lang = ((YTM_LANGUAGES as readonly string[]).includes(asked) ? asked : 'Hindi') as YtmLanguage
  const defs = ytmShelves(lang)
  const rows = await Promise.allSettled(defs.map((d) => ytm.search(d.query, 16)))
  const shelves = defs.map((d, i) => ({ id: d.id, title: d.title, songs: rows[i]!.status === 'fulfilled' ? rows[i]!.value : [] })).filter((s) => s.songs.length)
  if (!shelves.length) return { status: 502, body: { error: 'upstream' } }
  return { status: 200, body: { shelves }, cache: CACHE_SHELVES }
}

export default node(run)
