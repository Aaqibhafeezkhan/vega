import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YtDlp, assetName, cleanQuery, parseSearch, type Runner } from './ytdlp'

describe('helpers', () => {
  it('cleans queries', () => {
    expect(cleanQuery('  --exec evil  ')).toBe('exec evil')
    expect(cleanQuery('a\u0000b\nc')).toBe('a b c')
    expect(cleanQuery('x'.repeat(500))).toHaveLength(120)
  })
  it('picks the platform asset', () => {
    expect(assetName('win32')).toBe('yt-dlp.exe')
    expect(assetName('darwin')).toBe('yt-dlp_macos')
    expect(assetName('linux')).toBe('yt-dlp')
  })
  it('parses flat search output and drops junk', () => {
    const out = JSON.stringify({
      entries: [
        { id: 'dQw4w9WgXcQ', title: 'Song', channel: 'Artist', duration: 213 },
        { id: 'short', title: 'bad id', duration: 100 },
        { id: 'aaaaaaaaaaa', title: 'Live stream', duration: null },
        { id: 'bbbbbbbbbbb', title: 'Ten hour loop', duration: 40_000 },
        { id: 'ccccccccccc', title: 'No channel', uploader: 'Up', duration: 90 }
      ]
    })
    expect(parseSearch(out).map((e) => [e.id, e.channel])).toEqual([['dQw4w9WgXcQ', 'Artist'], ['ccccccccccc', 'Up']])
    expect(parseSearch('not json')).toEqual([])
  })
})

describe('YtDlp', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vega-ytdlp-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const bin = new Uint8Array([1, 2, 3, 4])
  const sha = createHash('sha256').update(bin).digest('hex')
  const fetcher = (sums: string): ((u: string) => Promise<Response>) => async (u) => (u.endsWith('SHA2-256SUMS') ? new Response(sums) : new Response(bin))

  it('installs after verifying the checksum', async () => {
    const y = new YtDlp(dir, 'win32', vi.fn() as unknown as Runner)
    await y.install(fetcher(`${sha}  yt-dlp.exe\nabc  yt-dlp\n`))
    expect([...(await readFile(y.binaryPath()))]).toEqual([1, 2, 3, 4])
  })

  it('refuses a binary that does not match the published checksum', async () => {
    const y = new YtDlp(dir, 'win32', vi.fn() as unknown as Runner)
    await expect(y.install(fetcher(`${'0'.repeat(64)}  yt-dlp.exe\n`))).rejects.toThrow('checksum')
    await expect(y.status()).resolves.toEqual({ installed: false })
  })

  it('builds safe argument arrays for search and resolve', async () => {
    const calls: string[][] = []
    const run: Runner = async (_b, args) => {
      calls.push(args)
      return args.includes('-g')
        ? { stdout: 'https://rr1.googlevideo.com/audio\n', stderr: '', code: 0 }
        : { stdout: JSON.stringify({ entries: [{ id: 'dQw4w9WgXcQ', title: 'T', channel: 'C', duration: 100 }] }), stderr: '', code: 0 }
    }
    const y = new YtDlp(dir, 'linux', run)
    expect((await y.search('--evil; rm -rf', 5)).length).toBe(1)
    expect(calls[0]).toEqual(['--ignore-config', '--no-warnings', '--flat-playlist', '-J', '--', 'ytsearch5:evil; rm -rf'])
    expect(await y.streamUrl('dQw4w9WgXcQ')).toBe('https://rr1.googlevideo.com/audio')
    expect(calls[1]!.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'])
    await expect(y.streamUrl('x; calc')).rejects.toThrow('bad video id')
  })

  it('asks for a muted video-only stream capped at the requested height', async () => {
    const calls: string[][] = []
    const run: Runner = async (_b, args) => {
      calls.push(args)
      return { stdout: 'https://rr1.googlevideo.com/video
', stderr: '', code: 0 }
    }
    const y = new YtDlp(dir, 'linux', run)
    expect(await y.videoUrl('dQw4w9WgXcQ', 720)).toBe('https://rr1.googlevideo.com/video')
    expect(calls[0]![calls[0]!.indexOf('-f') + 1]).toContain('height<=720')
    expect(calls[0]!.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'])
    await expect(y.videoUrl('bad id')).rejects.toThrow('bad video id')
  })

  it('surfaces yt-dlp errors', async () => {
    const run: Runner = async () => ({ stdout: '', stderr: 'ERROR: Sign in to confirm you are not a bot', code: 1 })
    await expect(new YtDlp(dir, 'linux', run).streamUrl('dQw4w9WgXcQ')).rejects.toThrow('not a bot')
  })
})
