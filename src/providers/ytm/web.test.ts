import { describe, expect, it, vi } from 'vitest'
import { createYtmWebProvider } from './web'
import { setYtmLanguage } from './index'

const song = { videoId: 'abc', title: 'Tum Hi Ho', artists: ['Arijit Singh'], durationSec: 262, thumbnail: 'https://x/y.jpg' }
const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

describe('ytm web provider', () => {
  it('searches through the api and maps songs to ytm tracks', async () => {
    const f = vi.fn(async (_u: string) => ok({ songs: [song] }))
    const r = await createYtmWebProvider('/api/ytm', f as never).search('tum hi', { kind: 'track', limit: 5 })
    expect(f.mock.calls[0]![0]).toBe('/api/ytm/search?q=tum%20hi&limit=5')
    expect(r.tracks[0]).toMatchObject({ ref: { source: 'ytm', id: 'abc' }, title: 'Tum Hi Ho', durationMs: 262000 })
  })

  it('resolves to the embedded player, never a stream url', async () => {
    const s = await createYtmWebProvider('/api/ytm', vi.fn() as never).resolve('abc')
    expect(s).toEqual({ kind: 'embed', provider: 'youtube', videoId: 'abc' })
  })

  it('browses shelves for the chosen language and drops empty ones', async () => {
    setYtmLanguage('Tamil')
    const f = vi.fn(async (_u: string) => ok({ shelves: [{ id: 'a', title: 'Top Tamil songs', songs: [song] }, { id: 'b', title: 'Empty', songs: [] }] }))
    const shelves = await createYtmWebProvider('/api/ytm', f as never).browse!()
    expect(f.mock.calls[0]![0]).toBe('/api/ytm/shelves?lang=Tamil')
    expect(shelves.map((s) => s.id)).toEqual(['a'])
  })

  it('throws when the api is down so the registry can fall back', async () => {
    const f = vi.fn(async (_u: string) => new Response('{}', { status: 502 }))
    await expect(createYtmWebProvider('/api/ytm', f as never).browse!()).rejects.toThrow()
    expect(await createYtmWebProvider('/api/ytm', f as never).health()).toBe('degraded')
  })
})
