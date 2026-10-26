import { YtMusic } from '../../src/main/ytmusic'

/** One YtMusic per warm function instance; its in-memory cache sits behind the CDN cache set by the handlers. */
export const ytm = new YtMusic((url, init) => fetch(url, init))

export const CACHE_SEARCH = 'public, s-maxage=600, stale-while-revalidate=86400'
export const CACHE_SHELVES = 'public, s-maxage=3600, stale-while-revalidate=86400'

export function json(body: unknown, cache?: string, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cache ? { 'Cache-Control': cache } : { 'Cache-Control': 'no-store' }) }
  })
}
