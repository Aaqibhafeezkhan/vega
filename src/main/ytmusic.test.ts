import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { YtMusic, bigCover, parseSongs } from './ytmusic'

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ytm-search.json'), 'utf8'))

describe('parseSongs', () => {
  const songs = parseSongs(fixture)

  it('parses title, artists, album, duration and cover from a recorded response', () => {
    expect(songs).toHaveLength(4)
    expect(songs[0]).toMatchObject({ videoId: 'uT_HXrrmHX8', title: 'Sitaare (From "Ikkis")', durationSec: 243, album: 'Sitaare (From "Ikkis")' })
    expect(songs[0]!.artists).toEqual(['Arijit Singh', 'White Noise Collectives', 'Amitabh Bhattacharya'])
    expect(songs[1]).toMatchObject({ videoId: 'FOA9iyxsW_A', title: 'AGAR TUM SAATH HO', durationSec: 342 })
    expect(songs[1]!.artists).toEqual(['Arijit Singh', 'Alka Yagnik'])
    expect(songs[1]!.album).toBe('TAMASHA')
    expect(songs[0]!.thumbnail).toContain('=w544-h544')
  })

  it('drops rows without a video id or duration, and tolerates junk', () => {
    expect(parseSongs({})).toEqual([])
    expect(parseSongs(null)).toEqual([])
    const bad = { a: { musicResponsiveListItemRenderer: { flexColumns: [] } } }
    expect(parseSongs(bad)).toEqual([])
  })

  it('upsizes cover urls', () => {
    expect(bigCover('https://x/y=w60-h60-l90-rj')).toBe('https://x/y=w544-h544-l90-rj')
    expect(bigCover('https://x/noparams')).toBe('https://x/noparams')
  })
})

describe('YtMusic', () => {
  const ok = (): Response => new Response(JSON.stringify(fixture), { status: 200 })

  it('sends a web-client search biased to the region and caches results', async () => {
    const f = vi.fn(async (_u: string, _i: { body: string }) => ok())
    const y = new YtMusic(f as never, () => 1000, 'IN')
    expect((await y.search('arijit singh', 3)).length).toBe(3)
    await y.search('Arijit Singh', 2)
    expect(f).toHaveBeenCalledTimes(1)
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.context.client).toMatchObject({ clientName: 'WEB_REMIX', gl: 'IN' })
    expect(body.query).toBe('arijit singh')
  })

  it('refreshes after the cache window and surfaces http errors', async () => {
    let t = 0
    const f = vi.fn(async () => ok())
    const y = new YtMusic(f as never, () => t)
    await y.search('a')
    t = 31 * 60_000
    await y.search('a')
    expect(f).toHaveBeenCalledTimes(2)
    const bad = new YtMusic((async () => new Response('', { status: 429 })) as never)
    await expect(bad.search('x')).rejects.toThrow('429')
    expect(await bad.search('   ')).toEqual([])
  })
})
