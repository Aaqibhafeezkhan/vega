import { refKey, type PlayEvent, type Track } from './types'

export interface Profile {
  artists: Map<string, number>
  genres: Map<string, number>
  tracks: Map<string, number>
}

/** Genres for a track: its own tags, or whatever enrichment learned about its artist. */
export type GenreResolver = (t: Track) => string[]

const HALF_LIFE_DAYS = 21
const DAY = 86_400_000
const SESSION_GAP_MS = 30 * 60_000

const ownGenres: GenreResolver = (t) => t.genres ?? []

/** Recency-decayed affinity of the user for artists / genres / tracks. Skips count negatively. */
export function buildProfile(events: PlayEvent[], now = Date.now(), genresOf: GenreResolver = ownGenres): Profile {
  const p: Profile = { artists: new Map(), genres: new Map(), tracks: new Map() }
  const add = (m: Map<string, number>, k: string, w: number): void => void m.set(k, (m.get(k) ?? 0) + w)
  for (const e of events) {
    const age = Math.max(0, now - e.startedAt) / DAY
    const decay = Math.pow(0.5, age / HALF_LIFE_DAYS)
    const w = (e.skipped ? -0.5 : e.counted ? 1 : 0.2) * decay
    add(p.tracks, refKey(e.track.ref), w)
    for (const a of e.track.artists) add(p.artists, a, w)
    for (const g of genresOf(e.track)) add(p.genres, g.toLowerCase(), w)
  }
  return p
}

export function scoreTrack(t: Track, p: Profile, genresOf: GenreResolver = ownGenres): number {
  let s = 0
  for (const a of t.artists) s += 1.0 * (p.artists.get(a) ?? 0)
  for (const g of genresOf(t)) s += 0.6 * (p.genres.get(g.toLowerCase()) ?? 0)
  return s
}

/**
 * Item-item co-listening: tracks played in the same session (gaps under 30 min) are related.
 * Returns, for each track key, how often every other track appeared in its sessions (only counted plays).
 */
export function buildCoListening(events: PlayEvent[]): Map<string, Map<string, number>> {
  const played = events.filter((e) => e.counted).sort((a, b) => a.startedAt - b.startedAt)
  const sessions: string[][] = []
  let cur: string[] = []
  let last = -Infinity
  for (const e of played) {
    if (e.startedAt - last > SESSION_GAP_MS && cur.length) {
      sessions.push(cur)
      cur = []
    }
    cur.push(refKey(e.track.ref))
    last = e.startedAt
  }
  if (cur.length) sessions.push(cur)

  const co = new Map<string, Map<string, number>>()
  for (const s of sessions) {
    const uniq = [...new Set(s)]
    for (const a of uniq) {
      for (const b of uniq) {
        if (a === b) continue
        const row = co.get(a) ?? new Map<string, number>()
        row.set(b, (row.get(b) ?? 0) + 1)
        co.set(a, row)
      }
    }
  }
  return co
}

/** Cosine-style normalised co-listening strength between a seed set and every candidate track key. */
export function coListeningScores(co: Map<string, Map<string, number>>, seeds: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of seeds) {
    const row = co.get(s)
    if (!row) continue
    const sSize = [...row.values()].reduce((n, v) => n + v, 0)
    for (const [k, v] of row) {
      const kSize = [...(co.get(k)?.values() ?? [])].reduce((n, x) => n + x, 0) || 1
      out.set(k, (out.get(k) ?? 0) + v / Math.sqrt(sSize * kSize))
    }
  }
  return out
}

export interface RankOpts {
  limit: number
  /** Drop tracks whose net play weight exceeds this (Discover uses a low cap). */
  maxFamiliarity?: number
  exclude?: Set<string>
  genresOf?: GenreResolver
  /** Extra per-track score, e.g. co-listening or "similar artist" boosts, keyed by refKey. */
  boost?: Map<string, number>
  /** Artists (lowercase) that an external source says are similar to the seed. */
  similarArtists?: Set<string>
}

/**
 * Content-based ranking with diversity: greedily pick the best score, halving the value of an artist already picked.
 * Cold start (empty profile) falls back to catalog order, so it always returns something.
 */
export function recommend(catalog: Track[], p: Profile, opts: RankOpts): Track[] {
  const { limit, maxFamiliarity = Infinity, exclude, genresOf = ownGenres, boost, similarArtists } = opts
  const remaining = catalog
    .filter((t) => {
      const k = refKey(t.ref)
      return !exclude?.has(k) && (p.tracks.get(k) ?? 0) <= maxFamiliarity
    })
    .map((t) => ({
      t,
      base:
        scoreTrack(t, p, genresOf) +
        (boost?.get(refKey(t.ref)) ?? 0) * 3 +
        (similarArtists && t.artists.some((a) => similarArtists.has(a.toLowerCase())) ? 1.5 : 0)
    }))
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

/** Search results re-ordered so what you already love and play surfaces first; provider order breaks ties. */
export function rankSearch(results: Track[], p: Profile, liked: Set<string>, query: string): Track[] {
  const q = query.trim().toLowerCase()
  const scored = results.map((t, i) => {
    const k = refKey(t.ref)
    const title = t.title.toLowerCase()
    const exact = title === q ? 3 : title.startsWith(q) ? 1.5 : 0
    const plays = Math.min(3, Math.max(0, p.tracks.get(k) ?? 0))
    const artistPlays = Math.min(3, Math.max(0, p.artists.get(t.artists[0] ?? '') ?? 0)) * 0.3
    return { t, score: exact + (liked.has(k) ? 2 : 0) + plays * 0.5 + artistPlays - i * 0.02 }
  })
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t)
}
