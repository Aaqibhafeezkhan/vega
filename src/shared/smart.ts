import { refKey, type PlayEvent, type Track } from './types'

/** Rule-based playlist that re-evaluates against your library whenever it changes. */
export type Field = 'artist' | 'title' | 'album' | 'genre' | 'year' | 'source' | 'plays' | 'daysSincePlayed' | 'liked' | 'minutes'
export type Op = 'is' | 'contains' | 'gt' | 'lt'

export interface Condition {
  field: Field
  op: Op
  value: string | number | boolean
}

export interface SmartPlaylist {
  id: string
  name: string
  match: 'all' | 'any'
  conditions: Condition[]
  limit: number
  sort: 'recent' | 'plays' | 'random' | 'title'
  createdAt: number
  updatedAt: number
}

export interface EvalContext {
  events: PlayEvent[]
  liked: Set<string>
  now: number
  genresOf?: (t: Track) => string[]
}

interface Stats {
  plays: number
  lastPlayed: number | null
}

const DAY = 86_400_000

export function playStats(events: PlayEvent[]): Map<string, Stats> {
  const m = new Map<string, Stats>()
  for (const e of events) {
    if (!e.counted) continue
    const k = refKey(e.track.ref)
    const s = m.get(k) ?? { plays: 0, lastPlayed: null }
    s.plays++
    s.lastPlayed = Math.max(s.lastPlayed ?? 0, e.startedAt)
    m.set(k, s)
  }
  return m
}

const text = (v: Condition['value']): string => String(v).toLowerCase()

function test(c: Condition, t: Track, stats: Stats | undefined, ctx: EvalContext): boolean {
  const num = (actual: number): boolean => {
    const v = Number(c.value)
    return c.op === 'gt' ? actual > v : c.op === 'lt' ? actual < v : actual === v
  }
  const str = (actual: string[]): boolean => {
    const v = text(c.value)
    return actual.some((a) => (c.op === 'is' ? a.toLowerCase() === v : a.toLowerCase().includes(v)))
  }
  switch (c.field) {
    case 'artist':
      return str(t.artists)
    case 'title':
      return str([t.title])
    case 'album':
      return str(t.album ? [t.album] : [])
    case 'genre':
      return str(ctx.genresOf ? ctx.genresOf(t) : (t.genres ?? []))
    case 'source':
      return str([t.ref.source])
    case 'year':
      return t.year !== undefined && num(t.year)
    case 'minutes':
      return num(t.durationMs / 60_000)
    case 'plays':
      return num(stats?.plays ?? 0)
    case 'daysSincePlayed': {
      // "not played in N days" => gt N; never-played tracks count as infinitely long ago
      const days = stats?.lastPlayed ? (ctx.now - stats.lastPlayed) / DAY : Infinity
      return num(days)
    }
    case 'liked':
      return ctx.liked.has(refKey(t.ref)) === (c.value === true || c.value === 'true')
  }
}

export function evaluateSmart(pl: SmartPlaylist, universe: Track[], ctx: EvalContext): Track[] {
  const stats = playStats(ctx.events)
  const seen = new Set<string>()
  const matched = universe.filter((t) => {
    const k = refKey(t.ref)
    if (seen.has(k)) return false
    seen.add(k)
    if (!pl.conditions.length) return true
    const results = pl.conditions.map((c) => test(c, t, stats.get(k), ctx))
    return pl.match === 'all' ? results.every(Boolean) : results.some(Boolean)
  })
  const by = (t: Track): Stats | undefined => stats.get(refKey(t.ref))
  const sorted = [...matched]
  if (pl.sort === 'plays') sorted.sort((a, b) => (by(b)?.plays ?? 0) - (by(a)?.plays ?? 0))
  else if (pl.sort === 'recent') sorted.sort((a, b) => (by(b)?.lastPlayed ?? 0) - (by(a)?.lastPlayed ?? 0))
  else if (pl.sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
  else if (pl.sort === 'random') sorted.sort(() => Math.random() - 0.5)
  return sorted.slice(0, Math.max(1, pl.limit))
}

export const FIELD_LABELS: Record<Field, string> = {
  artist: 'Artist',
  title: 'Title',
  album: 'Album',
  genre: 'Genre',
  year: 'Year',
  source: 'Source',
  plays: 'Play count',
  daysSincePlayed: 'Days since last played',
  liked: 'Liked',
  minutes: 'Length (minutes)'
}

export const FIELD_KIND: Record<Field, 'text' | 'number' | 'bool'> = {
  artist: 'text',
  title: 'text',
  album: 'text',
  genre: 'text',
  source: 'text',
  year: 'number',
  plays: 'number',
  daysSincePlayed: 'number',
  minutes: 'number',
  liked: 'bool'
}
