import { buildCoListening, buildProfile, coListeningScores, recommend, type GenreResolver } from '@shared/recs'
import { refKey, type PlayEvent, type Track } from '@shared/types'
import { sources } from './sources'
import { useCatalog } from '@/store/catalog'
import { useLibrary } from '@/store/library'
import { useMeta } from '@/store/meta'

/** Everything we know about and can recommend from: library, demo, likes, playlists and listening history. */
export function buildUniverse(extra: Track[] = []): Track[] {
  const { liked, playlists, events } = useLibrary.getState()
  const all = [...useCatalog.getState().tracks, ...liked, ...playlists.flatMap((p) => p.tracks), ...events.map((e) => e.track), ...extra]
  const seen = new Set<string>()
  return all.filter((t) => {
    const k = refKey(t.ref)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export const genresResolver = (): GenreResolver => useMeta.getState().genresFor

/** Recently counted plays, newest first, unique tracks. */
export function recentTracks(events: PlayEvent[], n: number): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const e of [...events].reverse()) {
    const k = refKey(e.track.ref)
    if (e.counted && !seen.has(k)) {
      seen.add(k)
      out.push(e.track)
      if (out.length >= n) break
    }
  }
  return out
}

/**
 * Radio from a seed track: same-session neighbours, same artist/genres, Last.fm similar artists (when a key is set),
 * widened with live searches so it works for online-only listeners too.
 */
export async function radioFrom(seed: Track, limit = 25): Promise<Track[]> {
  const meta = useMeta.getState()
  const { events } = useLibrary.getState()
  const genresOf = genresResolver()
  const artist = seed.artists[0] ?? ''

  const [similar, extra] = await Promise.all([
    meta.similarTo(artist),
    (async () => {
      const queries = [artist, ...genresOf(seed).slice(0, 1)].filter(Boolean)
      const lists = await Promise.all(queries.map((q) => sources.search(q, { limit: 25, timeoutMs: 4000 }).catch(() => [] as Track[])))
      return lists.flat()
    })()
  ])

  const universe = buildUniverse(extra)
  const seedKey = refKey(seed.ref)
  const profile = buildProfile([], Date.now(), genresOf)
  profile.artists.set(artist, 3)
  for (const g of genresOf(seed)) profile.genres.set(g.toLowerCase(), 2)
  const boost = coListeningScores(buildCoListening(events), [seedKey])

  const picks = recommend(universe, profile, { limit: limit - 1, exclude: new Set([seedKey]), genresOf, boost, similarArtists: new Set(similar) })
  return [seed, ...picks]
}
