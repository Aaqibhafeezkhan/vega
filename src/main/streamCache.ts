import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, utimes, writeFile, readFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MAX_FILE_BYTES = 300 * 1024 * 1024
export const DEFAULT_MAX_MB = 2048

export type ByteRange = { start: number; end: number }

/** Parses a single-range `Range: bytes=a-b` header. null = no range, 'invalid' = unsatisfiable. */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null | 'invalid' {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null // multi-range or junk: serve the whole file
  const [, a, b] = m
  if (a === '' && b === '') return 'invalid'
  if (a === '') {
    const n = Number(b)
    if (n === 0) return 'invalid'
    return { start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(a)
  const end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/** Only fetch public https hosts: the renderer must not be able to reach localhost or the LAN through the proxy. */
export function isAllowedStreamUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && isIP(host) === 0) return false
  const ip = isIP(host)
  if (ip === 4) {
    const [a, b] = host.split('.').map(Number) as [number, number]
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224)
  }
  if (ip === 6) return false
  return true
}

export const keyFor = (url: string): string => createHash('sha1').update(url).digest('hex')

export const encodeStreamUrl = (url: string): string => Buffer.from(url, 'utf8').toString('base64url')
export const decodeStreamUrl = (s: string): string => Buffer.from(s, 'base64url').toString('utf8')

interface Meta {
  contentType: string
  size: number
}

/** On-disk cache of fully downloaded audio streams with LRU eviction by last access time. */
export class StreamCache {
  private filling = new Map<string, Promise<void>>()

  constructor(
    private readonly dir: string,
    private maxBytes: number,
    private readonly fetchImpl: (url: string) => Promise<Response>
  ) {}

  setMaxBytes(n: number): void {
    this.maxBytes = n
    void this.evict()
  }

  private bin = (key: string): string => join(this.dir, `${key}.bin`)
  private meta = (key: string): string => join(this.dir, `${key}.json`)

  async lookup(url: string): Promise<{ path: string; meta: Meta } | null> {
    const key = keyFor(url)
    try {
      const [m, st] = await Promise.all([readFile(this.meta(key), 'utf8'), stat(this.bin(key))])
      const meta = JSON.parse(m) as Meta
      if (meta.size !== st.size) return null // partial or corrupt
      const now = new Date()
      void utimes(this.bin(key), now, now).catch(() => {}) // mark as recently used
      return { path: this.bin(key), meta }
    } catch {
      return null
    }
  }

  /** Streams a file (with Range support) out of the cache. */
  serve(path: string, meta: Meta, rangeHeader: string | null): Response {
    const range = parseRange(rangeHeader, meta.size)
    if (range === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } })
    const { start, end } = range ?? { start: 0, end: meta.size - 1 }
    const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': meta.contentType,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${meta.size}` } : {})
      }
    })
  }

  /** Downloads the whole stream in the background (once per url) so the next play is instant and works offline. */
  fill(url: string): Promise<void> {
    const key = keyFor(url)
    let p = this.filling.get(key)
    if (!p) {
      p = this.download(url, key)
        .catch(() => {})
        .finally(() => this.filling.delete(key))
      this.filling.set(key, p)
    }
    return p
  }

  private async download(url: string, key: string): Promise<void> {
    if (await this.lookup(url)) return
    await mkdir(this.dir, { recursive: true })
    const res = await this.fetchImpl(url)
    const type = res.headers.get('content-type') ?? ''
    const len = Number(res.headers.get('content-length') ?? 0)
    if (!res.ok || !res.body || !(type.startsWith('audio/') || type === 'application/octet-stream') || len > MAX_FILE_BYTES) return
    const part = `${this.bin(key)}.part`
    try {
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(part))
      const size = (await stat(part)).size
      if (size === 0 || size > MAX_FILE_BYTES || (len && size !== len)) throw new Error('incomplete download')
      await writeFile(this.meta(key), JSON.stringify({ contentType: type, size } satisfies Meta))
      await rename(part, this.bin(key))
      await this.evict()
    } catch (err) {
      await rm(part, { force: true })
      await rm(this.meta(key), { force: true })
      throw err
    }
  }

  async stats(): Promise<{ bytes: number; files: number; maxBytes: number }> {
    const files = await this.list()
    return { bytes: files.reduce((n, f) => n + f.size, 0), files: files.length, maxBytes: this.maxBytes }
  }

  private async list(): Promise<{ key: string; size: number; atime: number }[]> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return []
    }
    const out: { key: string; size: number; atime: number }[] = []
    for (const n of names) {
      if (!n.endsWith('.bin')) continue
      try {
        const st = await stat(join(this.dir, n))
        out.push({ key: n.slice(0, -4), size: st.size, atime: st.atimeMs })
      } catch {
        /* removed concurrently */
      }
    }
    return out
  }

  /** Remove least-recently-used entries until the cache is under 90% of its limit. */
  async evict(): Promise<void> {
    const files = (await this.list()).sort((a, b) => a.atime - b.atime)
    let total = files.reduce((n, f) => n + f.size, 0)
    if (total <= this.maxBytes) return
    const target = this.maxBytes * 0.9
    for (const f of files) {
      if (total <= target) break
      await rm(this.bin(f.key), { force: true })
      await rm(this.meta(f.key), { force: true })
      total -= f.size
    }
  }

  async clear(): Promise<void> {
    for (const f of await this.list()) {
      await rm(this.bin(f.key), { force: true })
      await rm(this.meta(f.key), { force: true })
    }
  }
}
