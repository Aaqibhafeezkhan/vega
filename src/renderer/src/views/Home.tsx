import { useEffect, useMemo, useState } from 'react'
import { buildCoListening, buildProfile, coListeningScores, recommend } from '@shared/recs'
import type { Shelf as ShelfData } from '@shared/provider'
import { refKey } from '@shared/types'
import { Cover } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { Shelf } from '@/components/Shelf'
import { buildUniverse, recentTracks } from '@/lib/recommender'
import { sources } from '@/lib/sources'
import { useCatalog } from '@/store/catalog'
import { useLibrary } from '@/store/library'
import { useMeta } from '@/store/meta'
import { useLang } from '@/store/lang'
import { useOnline } from '@/store/online'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const events = useLibrary((s) => s.events)
  const liked = useLibrary((s) => s.liked)
  const playlists = useLibrary((s) => s.playlists)
  const seed = useLibrary((s) => s.seedDemoHistory)
  const catalog = useCatalog((s) => s.tracks)
  const online = useOnline((s) => `${s.audius}|${s.archive}|${s.radio}|${s.ytm}|${s.jamendoClientId}`)
  const demo = useCatalog((s) => s.demo)
  const artistGenres = useMeta((s) => s.artistGenres)
  const genresFor = useMeta((s) => s.genresFor)
  const similarTo = useMeta((s) => s.similarTo)
  const lastfm = useMeta((s) => s.lastfmKey)
  const playTracks = usePlayer((s) => s.playTracks)
  const go = useUi((s) => s.go)
  const lang = useLang((s) => s.lang)
  const [shelves, setShelves] = useState<ShelfData[] | null>(null)
  const [similar, setSimilar] = useState<{ seed: string; artists: Set<string> } | null>(null)

  useEffect(() => {
    let live = true
    setShelves(null)
    void sources.browse().then((s) => live && setShelves(s))
    return () => {
      live = false
    }
  }, [online, demo, lang])

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
      mix: recommend(universe, profile, { limit: 14, genresOf: genresFor, boost, similarArtists }),
      discover: recommend(universe, profile, { limit: 14, maxFamiliarity: 0.3, exclude: seenRecent, genresOf: genresFor, boost, similarArtists }),
      because: recent[0]
        ? recommend(universe, profile, { limit: 12, exclude: new Set([refKey(recent[0].ref)]), genresOf: genresFor, boost: coListeningScores(buildCoListening(events), [refKey(recent[0].ref)]), similarArtists })
        : []
    }
    // artistGenres/liked/catalog change what the universe and genre lookups return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, recent, catalog, liked, artistGenres, genresFor, similar])

  const chart = useMemo(() => shelves?.[0]?.tracks.slice(0, 10) ?? [], [shelves])
  const minutes = Math.round(events.reduce((n, e) => n + e.listenedMs, 0) / 60_000)

  return (
    <div className="page-pad home">
      <header className="home-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="display">
            {greeting()}, <em>listener</em>
          </h1>
        </div>
        {events.length > 0 && (
          <div className="home-stats">
            <span>
              <b>{events.filter((e) => e.counted).length}</b> plays
            </span>
            <span>
              <b>{minutes}</b> min listened
            </span>
          </div>
        )}
      </header>

      {!events.length && !liked.length && (
        <div className="banner">
          <div>
            <strong>Welcome to Vega.</strong>
            <div className="muted">Play a few songs and your mixes, insights and recommendations appear here. Or try it with sample history.</div>
          </div>
          <button className="pill" onClick={seed}>
            Load demo history
          </button>
        </div>
      )}

      <div className="bento">
        <section className="tile mix">
          <span className="eyebrow" style={{ color: 'rgba(18,4,10,.7)' }}>Daily mix</span>
          <div>Made for you.</div>
          <div className="mix-row">
            <button className="mix-go" onClick={() => mix.length && playTracks(mix)} aria-label="Play mix">
              <Icon name="play" size={26} />
            </button>
            <span className="mix-tag">{mix.length} songs</span>
            <p>{events.length ? 'Built from what you play, skip and listen to together.' : 'Starts generic and gets sharper with every song you play.'}</p>
          </div>
          <div className="vinyl" aria-hidden />
        </section>
        <button className="tile t-violet" onClick={() => liked.length && playTracks(liked)}>
          <span className="tile-go"><Icon name="play" size={16} /></span>
          Liked songs
          <small>{liked.length} songs</small>
        </button>
        <button className="tile t-sun" onClick={() => go({ name: 'radio' })}>
          <span className="tile-go"><Icon name="play" size={16} /></span>
          Live radio
          <small>Around the world</small>
        </button>
        <button className="tile t-teal" onClick={() => discover.length && playTracks(discover)}>
          <span className="tile-go"><Icon name="play" size={16} /></span>
          Discover
          <small>New to you</small>
        </button>
        <button className="tile t-dark" onClick={() => go({ name: 'library' })}>
          <span className="tile-go"><Icon name="play" size={16} /></span>
          Your library
          <small>{playlists.length} playlists</small>
        </button>
        <button className="tile t-rose" onClick={() => go({ name: 'stats' })}>
          <span className="tile-go"><Icon name="play" size={16} /></span>
          Insights
          <small>{minutes} min listened</small>
        </button>
        <button className="tile t-paper" onClick={() => go({ name: 'sources' })}>
          <span className="tile-go"><Icon name="play" size={16} /></span>
          Sources
          <small>Where music comes from</small>
        </button>
      </div>

      {chart.length > 0 && (
        <section className="shelf">
          <div className="shelf-head">
            <h2 className="title-2">
              Top 10 in <em>{lang}</em>
            </h2>
            <button className="chip" onClick={() => playTracks(chart)}>
              <Icon name="play" size={12} /> Play all
            </button>
          </div>
          <div className="charts">
            {chart.map((t, i) => (
              <button key={refKey(t.ref)} className="rank" onClick={() => playTracks(chart, i)}>
                <span className={`n${i === 0 ? ' t1' : ''}`}>{i + 1}</span>
                <Cover track={t} size={50} radius={12} />
                <span className="rank-text" style={{ minWidth: 0 }}>
                  <span className="row-title" style={{ display: 'block' }}>{t.title}</span>
                  <span className="row-sub">{t.artists.join(', ')}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <Shelf title="Jump back in" tracks={recent} />
      {recent[0] && <Shelf title={`Because you played ${recent[0].title}`} tracks={because} />}
      <Shelf title="Discover" subtitle="Tracks you have not heard, close to your taste" tracks={discover} />

      {shelves === null && (
        <div className="shelf">
          <div className="skeleton" style={{ width: 220, height: 24, marginBottom: 16 }} />
          <div className="cards">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="card">
                <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 14, marginTop: 10, width: '80%' }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {shelves?.slice(1).map((s) => (
        <Shelf key={s.id} title={s.title} tracks={s.tracks} live={s.id.startsWith('radio')} />
      ))}
    </div>
  )
}
