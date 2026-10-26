import type { PlayEvent, Track } from './types'

export interface Summary {
  plays: number
  minutes: number
  uniqueTracks: number
  uniqueArtists: number
  skipRate: number
  topTracks: { track: Track; plays: number }[]
  topArtists: { artist: string; plays: number; minutes: number }[]
  topGenres: { genre: string; plays: number }[]
  /** clock[weekday 0=Sun][hour] => counted plays */
  clock: number[][]
  streakDays: number
}

const DAY = 86_400_000

const dayKey = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function summarize(events: PlayEvent[], now = Date.now()): Summary {
  const counted = events.filter((e) => e.counted)
  const byTrack = new Map<string, { track: Track; plays: number }>()
  const byArtist = new Map<string, { plays: number; ms: number }>()
  const byGenre = new Map<string, number>()
  const clock = Array.from({ length: 7 }, () => Array<number>(24).fill(0))

  for (const e of counted) {
    const k = `${e.track.ref.source}:${e.track.ref.id}`
    const bt = byTrack.get(k)
    if (bt) bt.plays += 1
    else byTrack.set(k, { track: e.track, plays: 1 })
    for (const a of e.track.artists) {
      const ba = byArtist.get(a) ?? { plays: 0, ms: 0 }
      ba.plays += 1
      ba.ms += e.listenedMs
      byArtist.set(a, ba)
    }
    for (const g of e.track.genres ?? []) byGenre.set(g, (byGenre.get(g) ?? 0) + 1)
    const d = new Date(e.startedAt)
    const row = clock[d.getDay()]
    if (row) row[d.getHours()] = (row[d.getHours()] ?? 0) + 1
  }

  const days = new Set(counted.map((e) => dayKey(e.startedAt)))
  let streak = 0
  for (let t = now; days.has(dayKey(t)); t -= DAY) streak++
  if (streak === 0) for (let t = now - DAY; days.has(dayKey(t)); t -= DAY) streak++

  const skips = events.filter((e) => e.skipped).length
  return {
    plays: counted.length,
    minutes: Math.round(events.reduce((n, e) => n + e.listenedMs, 0) / 60_000),
    uniqueTracks: byTrack.size,
    uniqueArtists: byArtist.size,
    skipRate: events.length ? skips / events.length : 0,
    topTracks: [...byTrack.values()].sort((a, b) => b.plays - a.plays).slice(0, 10),
    topArtists: [...byArtist.entries()]
      .map(([artist, v]) => ({ artist, plays: v.plays, minutes: Math.round(v.ms / 60_000) }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10),
    topGenres: [...byGenre.entries()]
      .map(([genre, plays]) => ({ genre, plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 8),
    clock,
    streakDays: streak
  }
}
