import type { IncomingMessage, ServerResponse } from 'node:http'
import { YtMusic } from '../../src/main/ytmusic'

/** One YtMusic per warm function instance; its in-memory cache sits behind the CDN cache set by the handlers. */
export const ytm = new YtMusic((url, init) => fetch(url, init))

export const CACHE_SEARCH = 'public, s-maxage=600, stale-while-revalidate=86400'
export const CACHE_SHELVES = 'public, s-maxage=3600, stale-while-revalidate=86400'

export interface Result {
  status: number
  body: unknown
  cache?: string
}

/** Adapts a pure `(url) => Result` function to a Vercel Node function. */
export function node(run: (url: URL) => Promise<Result>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const out = await run(new URL(req.url ?? '/', 'http://localhost')).catch((): Result => ({ status: 500, body: { error: 'internal' } }))
    res.statusCode = out.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', out.cache ?? 'no-store')
    res.end(JSON.stringify(out.body))
  }
}
