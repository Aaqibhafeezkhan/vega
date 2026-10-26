import { describe, expect, it } from 'vitest'
import { evaluateSmart, type SmartPlaylist } from './smart'
import { buildCoListening, buildProfile, coListeningScores, rankSearch, recommend } from './recs'
import { refKey, type PlayEvent, type Track } from './types'

const t = (id: string, artist: string, genres: string[] = [], year?: number, source = 'mock'): Track => ({
  ref: { source, id },
  title: `Song ${id}`,
  artists: [artist],
  genres,
  year,
  durationMs: 180_000
})
const NOW = 1_800_000_000_000
const DAY = 86_400_000
const ev = (track: Track, daysAgo: number, over: Partial<PlayEvent> = {}): PlayEvent => ({
  track,
  startedAt: NOW - daysAgo * DAY,
  listenedMs: 100_000,
  counted: true,
  skipped: false,
  ...over
})
const pl = (over: Partial<SmartPlaylist>): SmartPlaylist => ({ id: 'x', name: 'x', match: 'all', conditions: [], limit: 50, sort: 'title', createdAt: 0, updatedAt: 0, ...over })

describe('smart playlists', () => {
  const a = t('a', 'Nova', ['Synthwave'], 2020)
  const b = t('b', 'Nova', ['Indie'], 2012)
  const c = t('c', 'Mika', ['Synthwave'], 2018, 'audius')
  const universe = [a, b, c]
  const ctx = { events: [ev(a, 1), ev(a, 2), ev(b, 90)], liked: new Set([refKey(c.ref)]), now: NOW }

  it('matches all / any conditions', () => {
    const all = evaluateSmart(pl({ conditions: [{ field: 'artist', op: 'is', value: 'nova' }, { field: 'genre', op: 'contains', value: 'synth' }] }), universe, ctx)
    expect(all.map((x) => x.ref.id)).toEqual(['a'])
    const any = evaluateSmart(pl({ match: 'any', conditions: [{ field: 'source', op: 'is', value: 'audius' }, { field: 'year', op: 'lt', value: 2015 }] }), universe, ctx)
    expect(any.map((x) => x.ref.id)).toEqual(['b', 'c'])
  })

  it('supports play-count, liked, and "not played in N days" (never played counts)', () => {
    expect(evaluateSmart(pl({ conditions: [{ field: 'plays', op: 'gt', value: 1 }] }), universe, ctx).map((x) => x.ref.id)).toEqual(['a'])
    expect(evaluateSmart(pl({ conditions: [{ field: 'liked', op: 'is', value: true }] }), universe, ctx).map((x) => x.ref.id)).toEqual(['c'])
    expect(evaluateSmart(pl({ conditions: [{ field: 'daysSincePlayed', op: 'gt', value: 30 }] }), universe, ctx).map((x) => x.ref.id)).toEqual(['b', 'c'])
  })

  it('sorts, limits and dedupes the universe', () => {
    const out = evaluateSmart(pl({ sort: 'plays', limit: 2 }), [...universe, a], ctx)
    expect(out.map((x) => x.ref.id)).toEqual(['a', 'b'])
  })

  it('uses a genre resolver so enriched tags count', () => {
    const bare = t('d', 'Q')
    const out = evaluateSmart(pl({ conditions: [{ field: 'genre', op: 'is', value: 'jazz' }] }), [bare], { ...ctx, genresOf: () => ['Jazz'] })
    expect(out).toHaveLength(1)
  })
})

describe('co-listening', () => {
  const x = t('x', 'A')
  const y = t('y', 'B')
  const z = t('z', 'C')
  const events = [
    ev(x, 10), ev(y, 10 - 0.01), // session 1: x + y
    ev(x, 5), ev(y, 5 - 0.01), // session 2: x + y
    ev(z, 2) // alone
  ]

  it('relates tracks played in the same session only', () => {
    const co = buildCoListening(events)
    const s = coListeningScores(co, [refKey(x.ref)])
    expect(s.get(refKey(y.ref))).toBeGreaterThan(0)
    expect(s.has(refKey(z.ref))).toBe(false)
  })

  it('boost surfaces the co-listened track in recommendations', () => {
    const co = buildCoListening(events)
    const boost = coListeningScores(co, [refKey(x.ref)])
    const out = recommend([z, y], buildProfile([]), { limit: 2, boost })
    expect(out[0]?.ref.id).toBe('y')
  })
})

describe('recommend extras', () => {
  it('resolves genres through enrichment and boosts similar artists', () => {
    const p = buildProfile([ev(t('1', 'A'), 1)], NOW, () => ['jazz'])
    const cand = [t('2', 'B'), t('3', 'C')]
    const byGenre = recommend(cand, p, { limit: 2, genresOf: (tr) => (tr.artists[0] === 'C' ? ['Jazz'] : []) })
    expect(byGenre[0]?.artists[0]).toBe('C')
    const sim = recommend(cand, buildProfile([]), { limit: 2, similarArtists: new Set(['b']) })
    expect(sim[0]?.artists[0]).toBe('B')
  })
})

describe('rankSearch', () => {
  it('floats liked and exact matches, keeps provider order otherwise', () => {
    const r1 = t('1', 'A')
    const r2 = { ...t('2', 'B'), title: 'jazz' }
    const r3 = t('3', 'C')
    const liked = new Set([refKey(r3.ref)])
    const out = rankSearch([r1, r2, r3], buildProfile([]), liked, 'jazz')
    expect(out.map((x) => x.ref.id)).toEqual(['2', '3', '1'])
  })
})
