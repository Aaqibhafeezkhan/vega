import { CACHE_SEARCH, json, ytm } from './_shared'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  if (!q) return json({ songs: [] }, CACHE_SEARCH)
  try {
    return json({ songs: await ytm.search(q, limit) }, CACHE_SEARCH)
  } catch {
    return json({ error: 'upstream' }, undefined, 502)
  }
}
