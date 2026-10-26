import { describe, expect, it } from 'vitest'
import { buildProfile, recommend } from './recs'
import type { PlayEvent, Track } from './types'

const t = (id: string, artist: string, genres: string[]): Track => ({
  ref: { source: 'mock', id },
  title: id,
  artists: [artist],
  genres,
  durationMs: 1000
})
const ev = (track: Track, over: Partial<PlayEvent> = {}): PlayEvent => ({
  track,
  startedAt: Date.now(),
  listenedMs: 60_000,
  counted: true,
  skipped: false,
  ...over
})

describe('recommend', () => {
  const catalog = [t('a1', 'A', ['rock']), t('a2', 'A', ['rock']), t('b1', 'B', ['jazz']), t('c1', 'C', ['rock'])]

  it('ranks by affinity and diversifies artists', () => {
    const p = buildProfile([ev(t('x', 'A', ['rock'])), ev(t('y', 'A', ['rock']))])
    const out = recommend([...catalog, t('a3', 'A', ['rock'])], p, { limit: 4 })
    expect(out[0]?.artists[0]).toBe('A')
    expect(out.findIndex((x) => x.ref.id === 'c1')).toBeLessThan(out.findIndex((x) => x.ref.id === 'a3'))
  })

  it('cold start returns catalog', () => {
    expect(recommend(catalog, buildProfile([]), { limit: 2 })).toHaveLength(2)
  })

  it('pushes skipped artists down', () => {
    const p = buildProfile([ev(t('s', 'B', ['jazz']), { skipped: true, counted: false })])
    const out = recommend(catalog, p, { limit: 4 })
    expect(out[out.length - 1]?.artists[0]).toBe('B')
  })
})
