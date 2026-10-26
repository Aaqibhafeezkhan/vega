import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { proxyStream } from './streamProxy'

let server: Server
let base = ''
const seen: Array<{ url?: string; range?: string; ua?: string }> = []
const BODY = Buffer.from('0123456789'.repeat(100)) // 1000 bytes

beforeEach(async () => {
  seen.length = 0
  server = createServer((req, res) => {
    seen.push({ url: req.url, range: req.headers.range, ua: req.headers['user-agent'] })
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/audio' }).end()
    } else if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' }).end()
    } else if (req.headers.range) {
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range)!
      const start = Number(m[1])
      const end = m[2] ? Number(m[2]) : BODY.length - 1
      res.writeHead(206, { 'Content-Type': 'audio/mp4', 'Content-Range': `bytes ${start}-${end}/${BODY.length}`, 'Content-Length': end - start + 1, 'Set-Cookie': 'x=1' })
      res.end(BODY.subarray(start, end + 1))
    } else {
      res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Content-Length': BODY.length })
      res.end(BODY)
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  await new Promise((r) => server.close(r))
})

const allow = (): boolean => true

describe('proxyStream', () => {
  it('passes a Range request through and returns a 206 with only the safe headers', async () => {
    const r = await proxyStream(`${base}/audio`, 'bytes=10-19', { allow })
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 10-19/1000')
    expect(r.headers.get('set-cookie')).toBeNull()
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('0123456789')
    expect(seen[0]!.range).toBe('bytes=10-19')
    expect(seen[0]!.ua).toContain('Mozilla')
  })

  it('serves a full response without a Range', async () => {
    const r = await proxyStream(`${base}/audio`, null, { allow })
    expect(r.status).toBe(200)
    expect(r.headers.get('accept-ranges')).toBe('bytes')
    expect((await r.arrayBuffer()).byteLength).toBe(1000)
  })

  it('follows redirects and re-checks every hop', async () => {
    const ok = await proxyStream(`${base}/redirect`, null, { allow })
    expect(ok.status).toBe(200)
    const blocked = await proxyStream(`${base}/redirect`, null, { allow: (u) => !u.endsWith('/audio') })
    expect(blocked.status).toBe(403)
  })

  it('gives up on redirect loops and refuses disallowed urls up front', async () => {
    expect((await proxyStream(`${base}/loop`, null, { allow, maxRedirects: 3 })).status).toBe(508)
    expect((await proxyStream('http://127.0.0.1:1/x', null)).status).toBe(403) // default policy: public https only
  })
})
