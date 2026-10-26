import { describe, expect, it, vi } from 'vitest'
import { createAudiusProvider } from './audius'
import { createJamendoProvider } from './jamendo'

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('audius provider', () => {
  const rows = [
    { id: 'a1', title: 'Good', duration: 180, genre: 'Electronic', release_date: '2024-03-01T00:00:00Z', user: { name: 'DJ X' }, artwork: { '480x480': 'https://img/480.jpg' }, is_streamable: true, access: { stream: true } },
    { id: 'a2', title: 'Gated', duration: 200, user: { name: 'Y' }, access: { stream: false } },
    { id: 'a3', title: 'Deactivated artist', duration: 100, user: { name: 'Z', is_deactivated: true } },
    { id: 'a4', title: 'Not streamable', duration: 100, user: { name: 'Z' }, is_streamable: false }
  ]

  it('maps results and drops unplayable ones', async () => {
    const f = vi.fn(async () => json({ data: rows }))
    const p = createAudiusProvider({ fetchImpl: f as unknown as typeof fetch })
    const { tracks } = await p.search('x', { kind: 'track', limit: 10 })
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({
      ref: { source: 'audius', id: 'a1' },
      title: 'Good',
      artists: ['DJ X'],
      durationMs: 180_000,
      genres: ['Electronic'],
      year: 2024,
      artworkUrl: 'https://img/480.jpg'
    })
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('app_name=vega')
  })

  it('resolves to the redirecting stream endpoint', async () => {
    const p = createAudiusProvider({ fetchImpl: (() => {
      throw new Error('no network expected')
    }) as unknown as typeof fetch })
    const s = await p.resolve('a1')
    expect(s).toMatchObject({ kind: 'url', url: 'https://api.audius.co/v1/tracks/a1/stream?app_name=vega' })
  })

  it('throws on http errors so the registry can trip its breaker', async () => {
    const p = createAudiusProvider({ fetchImpl: (async () => json({}, 503)) as unknown as typeof fetch })
    await expect(p.search('x', { kind: 'track', limit: 5 })).rejects.toThrow('Audius 503')
  })

  it('browse returns the shelves that succeeded', async () => {
    let n = 0
    const f = async (): Promise<Response> => (n++ === 1 ? json({}, 500) : json({ data: rows }))
    const shelves = await createAudiusProvider({ fetchImpl: f as unknown as typeof fetch }).browse!()
    expect(shelves.length).toBe(3)
    expect(shelves[0]?.tracks).toHaveLength(1)
  })
})

describe('jamendo provider', () => {
  const ok = (results: unknown[]): Response => json({ headers: { status: 'success', code: 0 }, results })
  const track = { id: '42', name: 'Song', duration: 200, artist_name: 'Band', album_name: 'LP', image: 'https://img/c.jpg', audio: 'https://stream/42.mp3', releasedate: '2019-05-05', musicinfo: { tags: { genres: ['electronic', 'ambient', 'x'] } } }

  it('maps results', async () => {
    const f = vi.fn(async () => ok([track]))
    const p = createJamendoProvider({ clientId: 'abc', fetchImpl: f as unknown as typeof fetch })
    const { tracks } = await p.search('song', { kind: 'track', limit: 5 })
    expect(tracks[0]).toMatchObject({ ref: { source: 'jamendo', id: '42' }, artists: ['Band'], album: 'LP', year: 2019, genres: ['Electronic', 'Ambient'], durationMs: 200_000 })
    const url = String((f.mock.calls[0] as unknown[])[0])
    expect(url).toContain('client_id=abc')
    expect(url).toContain('search=song')
  })

  it('resolves just in time to the mp3 url', async () => {
    const p = createJamendoProvider({ clientId: 'abc', fetchImpl: (async () => ok([track])) as unknown as typeof fetch })
    expect(await p.resolve('42')).toMatchObject({ kind: 'url', url: 'https://stream/42.mp3' })
  })

  it('surfaces api-level failures (bad client id)', async () => {
    const f = async (): Promise<Response> => json({ headers: { status: 'failed', code: 5, error_message: 'Invalid client_id' }, results: [] })
    const p = createJamendoProvider({ clientId: 'bad', fetchImpl: f as unknown as typeof fetch })
    await expect(p.search('x', { kind: 'track', limit: 5 })).rejects.toThrow('Invalid client_id')
    expect(await p.health()).toBe('down')
  })
})
