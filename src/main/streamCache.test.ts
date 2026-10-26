import { mkdtemp, rm, utimes, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StreamCache, decodeStreamUrl, encodeStreamUrl, isAllowedStreamUrl, parseRange } from './streamCache'

describe('parseRange', () => {
  it('handles the common forms', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=50-', 100)).toEqual({ start: 50, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
  })
  it('rejects unsatisfiable and ignores multi-range', () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid')
    expect(parseRange('bytes=9-2', 100)).toBe('invalid')
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
  })
})

describe('isAllowedStreamUrl', () => {
  it('allows public https only', () => {
    expect(isAllowedStreamUrl('https://creatornode.audius.co/x.mp3')).toBe(true)
    expect(isAllowedStreamUrl('http://archive.org/x.mp3')).toBe(false)
    expect(isAllowedStreamUrl('https://localhost/x')).toBe(false)
    expect(isAllowedStreamUrl('https://127.0.0.1/x')).toBe(false)
    expect(isAllowedStreamUrl('https://192.168.1.5/x')).toBe(false)
    expect(isAllowedStreamUrl('https://10.0.0.1/x')).toBe(false)
    expect(isAllowedStreamUrl('https://169.254.169.254/latest')).toBe(false)
    expect(isAllowedStreamUrl('https://[::1]/x')).toBe(false)
    expect(isAllowedStreamUrl('https://intranet/x')).toBe(false)
    expect(isAllowedStreamUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedStreamUrl('nonsense')).toBe(false)
  })
  it('round-trips the url encoding', () => {
    const u = 'https://api.audius.co/v1/tracks/x/stream?app_name=vega&a=b'
    expect(decodeStreamUrl(encodeStreamUrl(u))).toBe(u)
  })
})

describe('StreamCache', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vega-cache-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const audio = (n: number, type = 'audio/mpeg'): Response =>
    new Response(new Uint8Array(n).fill(7), { status: 200, headers: { 'content-type': type, 'content-length': String(n) } })

  it('downloads once, then serves from disk with ranges', async () => {
    let fetches = 0
    const c = new StreamCache(dir, 1_000_000, async () => {
      fetches++
      return audio(1000)
    })
    expect(await c.lookup('https://a/x.mp3')).toBeNull()
    await c.fill('https://a/x.mp3')
    await c.fill('https://a/x.mp3')
    expect(fetches).toBe(1)
    const hit = await c.lookup('https://a/x.mp3')
    expect(hit?.meta).toEqual({ contentType: 'audio/mpeg', size: 1000 })
    const res = c.serve(hit!.path, hit!.meta, 'bytes=10-19')
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 10-19/1000')
    expect((await res.arrayBuffer()).byteLength).toBe(10)
    expect(c.serve(hit!.path, hit!.meta, 'bytes=5000-').status).toBe(416)
    expect(c.serve(hit!.path, hit!.meta, null).status).toBe(200)
  })

  it('does not cache non-audio responses or failures', async () => {
    const c = new StreamCache(dir, 1_000_000, async () => audio(100, 'text/html'))
    await c.fill('https://a/page')
    expect(await c.lookup('https://a/page')).toBeNull()
    const bad = new StreamCache(dir, 1_000_000, async () => new Response('no', { status: 404 }))
    await bad.fill('https://a/missing')
    expect((await readdir(dir)).filter((f) => !f.startsWith('.'))).toEqual([])
  })

  it('evicts least recently used files over the limit', async () => {
    const c = new StreamCache(dir, 2500, async () => audio(1000))
    await c.fill('https://a/1')
    await c.fill('https://a/2')
    const old = new Date(Date.now() - 100_000)
    const h1 = await c.lookup('https://a/1')
    await new Promise((r) => setTimeout(r, 40)) // lookup touches the file in the background; let that land first
    await utimes(h1!.path, old, old) // make #1 the oldest
    await c.fill('https://a/3') // 3000 bytes > 2500 -> evict oldest
    expect(await c.lookup('https://a/1')).toBeNull()
    expect(await c.lookup('https://a/2')).not.toBeNull()
    expect(await c.lookup('https://a/3')).not.toBeNull()
    expect((await c.stats()).files).toBe(2)
    await c.clear()
    expect((await c.stats()).files).toBe(0)
  })
})
