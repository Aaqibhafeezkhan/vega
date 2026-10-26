import { useEffect, useMemo, useState } from 'react'
import { buildCoListening, buildProfile, coListeningScores, recommend } from '@shared/recs'
import type { Shelf as ShelfData } from '@shared/provider'
import { refKey } from '@shared/types'
import { Shelf } from '@/components/Shelf'
import { buildUniverse, recentTracks } from '@/lib/recommender'
import { sources } from '@/lib/sources'
import { useCatalog } from '@/store/catalog'
import { useLibrary } from '@/store/library'
import { useMeta } from '@/store/meta'
import { useOnline } from '@/store/online'

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const events = useLibrary((s) => s.events)
  const liked = useLibrary((s) => s.liked)
  const seed = useLibrary((s) => s.seedDemoHistory)
  const catalog = useCatalog((s) => s.tracks)
  const online = useOnline((s) => `${s.audius}|${s.archive}|${s.jamendoClientId}`)
  const demo = useCatalog((s) => s.demo)
  const artistGenres = useMeta((s) => s.artistGenres)
  const genresFor = useMeta((s) => s.genresFor)
  const similarTo = useMeta((s) => s.similarTo)
  const lastfm = useMeta((s) => s.lastfmKey)
  const [shelves, setShelves] = useState<ShelfData[]>([])
  const [similar, setSimilar] = useState<{ seed: string; artists: Set<string> } | null>(null)

  useEffect(() => {
    let live = true
    void sources.browse().then((s) => live && setShelves(s))
    return () => {
      live = false
    }
  }, [online, demo])

  const recent = useMemo(() => recentTracks(events, 10), [events])

  // Last.fm: artists similar to your most-played recent artist (only with a key)
  const topArtist = recent[0]?.artists[0]
  useEffect(() => {
    let live = true
    if (!topArtist || !lastfm) {
      setSimilar(null)
      return
    }
    void similarTo(topArtist).then((a) => live && setSimilar({ seed: topArtist, artists: new Set(a) }))
    return () => {
      live = false
    }
  }, [topArtist, lastfm, similarTo])

  const { mix, discover, because } = useMemo(() => {
    const universe = buildUniverse()
    const profile = buildProfile(events, Date.now(), genresFor)
    const seenRecent = new Set(recent.map((t) => refKey(t.ref)))
    const boost = coListeningScores(buildCoListening(events), recent.slice(0, 5).map((t) => refKey(t.ref)))
    const similarArtists = similar?.artists
    return {
      mix: recommend(universe, profile, { limit: 12, genresOf: genresFor, boost, similarArtists }),
      discover: recommend(universe, profile, { limit: 12, maxFamiliarity: 0.3, exclude: seenRecent, genresOf: genresFor, boost, similarArtists }),
      because: recent[0]
        ? recommend(universe, profile, { limit: 10, exclude: new Set([refKey(recent[0].ref)]), genresOf: genresFor, boost: coListeningScores(buildCoListening(events), [refKey(recent[0].ref)]), similarArtists })
        : []
    }
    // artistGenres/liked/catalog change what the universe and genre lookups return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, recent, catalog, liked, artistGenres, genresFor, similar])

  return (
    <div className="view">
      <h1>{greeting()}</h1>
      {!events.length && (
        <div className="banner">
          <div>
            <strong>Welcome to Vega.</strong> Play a few songs and recommendations and insights appear here. Or explore with sample history.
          </div>
          <button className="pill" onClick={seed}>
            Load demo history
          </button>
        </div>
      )}
      <Shelf title="Jump back in" tracks={recent} />
      <Shelf title="Made for you" subtitle={events.length ? 'Based on what you play, skip and listen to together' : 'Your daily mix starts generic and sharpens as you listen'} tracks={mix} />
      {recent[0] && <Shelf title={`Because you played ${recent[0].title}`} tracks={because} />}
      <Shelf title="Discover" subtitle="Tracks you have not heard, close to your taste" tracks={discover} />
      {shelves.map((s) => (
        <Shelf key={s.id} title={s.title} tracks={s.tracks} />
      ))}
    </div>
  )
}
