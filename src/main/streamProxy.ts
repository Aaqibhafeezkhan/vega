import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import { isAllowedStreamUrl } from './streamCache'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const PASS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']

export interface ProxyOptions {
  maxRedirects?: number
  allow?: (url: string) => boolean
  timeoutMs?: number
}

function open(url: string, range: string | null, timeoutMs: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http:') ? http : https
    const req = mod.request(url, { method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*', ...(range ? { Range: range } : {}) } }, resolve)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('upstream timeout')))
    req.on('error', reject)
    req.end()
  })
}

/**
 * Streams a remote audio/video URL to the renderer chunk by chunk, passing Range requests through and following redirects
 * (each hop must still be a public https host). Doing this with Node's https instead of net.fetch keeps the stream truly
 * incremental, so playback starts as soon as the first bytes arrive instead of after the whole file has been read.
 */
export async function proxyStream(url: string, range: string | null, opts: ProxyOptions = {}): Promise<Response> {
  const { maxRedirects = 5, allow = isAllowedStreamUrl, timeoutMs = 20_000 } = opts
  let current = url
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!allow(current)) return new Response('forbidden', { status: 403 })
    const res = await open(current, range, timeoutMs)
    const status = res.statusCode ?? 502
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume() // drop the redirect body
      current = new URL(res.headers.location, current).toString()
      continue
    }
    const headers = new Headers()
    for (const h of PASS) {
      const v = res.headers[h]
      if (typeof v === 'string') headers.set(h, v)
    }
    if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
    const noBody = status === 204 || status === 304
    return new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), { status, headers })
  }
  return new Response('too many redirects', { status: 508 })
}
