import { dataApiSearch } from './_dataApi'
import { CACHE_SEARCH, node, ytm, type Result } from './_shared'

export async function run(url: URL): Promise<Result> {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  if (!q) return { status: 200, body: { songs: [] }, cache: CACHE_SEARCH }
  try {
    return { status: 200, body: { songs: await ytm.search(q, limit) }, cache: CACHE_SEARCH }
  } catch {
    const key = process.env.YT_API_KEY
    if (key) {
      try {
        return { status: 200, body: { songs: await dataApiSearch(q, limit, key) }, cache: CACHE_SEARCH }
      } catch {
        /* fall through */
      }
    }
    return { status: 502, body: { error: 'upstream' } }
  }
}

export default node(run)
