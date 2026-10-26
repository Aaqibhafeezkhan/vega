import type { IncomingMessage, ServerResponse } from 'node:http'

/** Same-origin artwork proxy: YouTube's image hosts block cross-origin reads, which the player needs for its colour theme. */
const HOSTS = /^(yt3|lh3|lh4|lh5|lh6)\.googleusercontent\.com$|^i\d?\.ytimg\.com$/

export const allowed = (raw: string): URL | null => {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && HOSTS.test(u.hostname) ? u : null
  } catch {
    return null
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const target = allowed(new URL(req.url ?? '/', 'http://localhost').searchParams.get('u') ?? '')
  if (!target) {
    res.statusCode = 400
    res.end('bad url')
    return
  }
  try {
    const up = await fetch(target)
    if (!up.ok || !(up.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(String(up.status))
    res.statusCode = 200
    res.setHeader('Content-Type', up.headers.get('content-type')!)
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable')
    res.end(Buffer.from(await up.arrayBuffer()))
  } catch {
    res.statusCode = 502
    res.end('upstream')
  }
}
