import { refKey, type PlayEvent, type Track } from './types'

export interface Profile {
  artists: Map<string, number>
  genres: Map<string, number>
  tracks: Map<string, number>
}

const HALF_LIFE_DAYS = 21
const DAY = 86_400_000

/** Recency-decayed affinity of the user for artists / genres / tracks. Skips count negatively. */
export function buildProfile(events: PlayEvent[], now = Date.now()): Profile {
  const p: Profile = { artists: new Map(), genres: new Map(), tracks: new Map() }
  const add = (m: Map<string, number>, k: string, w: number): void => void m.set(k, (m.get(k) ?? 0) + w)
  for (const e of events) {
    const age = Math.max(0, now - e.startedAt) / DAY
    const decay = Math.pow(0.5, age / HALF_LIFE_DAYS)
    const w = (e.skipped ? -0.5 : e.counted ? 1 : 0.2) * decay
    add(p.tracks, refKey(e.track.ref), w)
    for (const a of e.track.artists) add(p.artists, a, w)
    for (const g of e.track.genres ?? []) add(p.genres, g, w)
  }
  return p
}

export function scoreTrack(t: Track, p: Profile): number {
  let s = 0
  for (const a of t.artists) s += 1.0 * (p.artists.get(a) ?? 0)
  for (const g of t.genres ?? []) s += 0.6 * (p.genres.get(g) ?? 0)
  return s
}

interface RankOpts {
  limit: number
  /** Drop tracks whose net play weight exceeds this (Discover uses a low cap). */
  maxFamiliarity?: number
  exclude?: Set<string>
}

/**
 * Content-based ranking with diversity: greedily pick the best score, penalising artists already picked.
 * Cold start (empty profile) falls back to catalog order, so it always returns something.
 */
export function recommend(catalog: Track[], p: Profile, opts: RankOpts): Track[] {
  const { limit, maxFamiliarity = Infinity, exclude } = opts
  const remaining = catalog
    .filter((t) => {
      const k = refKey(t.ref)
      return !exclude?.has(k) && (p.tracks.get(k) ?? 0) <= maxFamiliarity
    })
    .map((t) => ({ t, base: scoreTrack(t, p) }))
  const picked: Track[] = []
  const artistCount = new Map<string, number>()
  while (picked.length < limit && remaining.length) {
    let best = 0
    let bestScore = -Infinity
    remaining.forEach((c, i) => {
      const repeats = c.t.artists.reduce((n, a) => n + (artistCount.get(a) ?? 0), 0)
      const sc = c.base > 0 ? c.base * Math.pow(0.5, repeats) : c.base
      if (sc > bestScore) {
        bestScore = sc
        best = i
      }
    })
    const [chosen] = remaining.splice(best, 1)
    if (!chosen) break
    picked.push(chosen.t)
    for (const a of chosen.t.artists) artistCount.set(a, (artistCount.get(a) ?? 0) + 1)
  }
  return picked
}
