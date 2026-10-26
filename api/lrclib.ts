import type { IncomingMessage, ServerResponse } from 'node:http'
import { limited } from './_limit'

/**
 * Edge-cached pass-through to LRCLIB (https://lrclib.net). Lyrics for a song are the same for everyone, so one lookup
 * serves all listeners for a day and the browser never hits LRCLIB's per-IP rate limit directly.
 */
const ALLOWED = /^\/(get|search)\?[\w%=&.+\-,~*!'()]*$/

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = new URL(req.url ?? '/', 'http://localhost').searchParams.get('p') ?? ''
  if (!ALLOWED.test(path) || path.length > 600) {
    res.statusCode = 400
    return void res.end('bad request')
  }
  if (limited(req, 'lrclib', 90)) {
    res.statusCode = 429
    res.setHeader('Retry-After', '30')
    return void res.end('slow down')
  }
  try {
    const up = await fetch(`https://lrclib.net/api${path}`, { headers: { 'User-Agent': 'Vega (https://github.com/DhruvHarani1/vega)', Accept: 'application/json' } })
    const body = await up.text()
    res.statusCode = up.status === 404 ? 404 : up.ok ? 200 : up.status === 429 ? 429 : 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // found: a day; not found: an hour (new uploads appear); errors: never cached
    res.setHeader('Cache-Control', up.ok ? 'public, s-maxage=86400, stale-while-revalidate=604800' : up.status === 404 ? 'public, s-maxage=3600' : 'no-store')
    if (up.status === 429) res.setHeader('Retry-After', up.headers.get('retry-after') ?? '30')
    res.end(up.ok || up.status === 404 ? body : '{}')
  } catch {
    res.statusCode = 502
    res.end('{}')
  }
}
