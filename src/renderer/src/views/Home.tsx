import { useEffect, useMemo, useState } from 'react'
import { buildCoListening, buildProfile, coListeningScores, recommend } from '@shared/recs'
import type { Shelf as ShelfData } from '@shared/provider'
import { refKey, type Track } from '@shared/types'
import { Cover } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { Shelf } from '@/components/Shelf'
import { buildUniverse, recentTracks } from '@/lib/recommender'
import { sources } from '@/lib/sources'
import { useCatalog } from '@/store/catalog'
import { useLibrary } from '@/store/library'
import { useMeta } from '@/store/meta'
import { useOnline } from '@/store/online'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function QuickTile({ title, sub, tracks, icon }: { title: string; sub: string; tracks: Track[]; icon?: string }) {
  const playTracks = usePlayer((s) => s.playTracks)
  const first = tracks[0]
  return (
    <button className="quick" onClick={() => tracks.length && playTracks(tracks)} disabled={!tracks.length}>
      <span className="quick-art">{icon ? <Icon name={icon} size={22} /> : first && <Cover track={first} size={64} radius={0} />}</span>
      <span className="quick-text">
        <span className="row-title">{title}</span>
        <span className="row-sub">{sub}</span>
      </span>
      <span className="quick-play">
        <Icon name="play" size={18} />
      </span>
    </button>
  )
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
  const [shelves, setShelves] = useState<ShelfData[] | null>(null)
  const [similar, setSimilar] = useState<{ seed: string; artists: Set<string> } | null>(null)

  useEffect(() => {
    let live = true
    setShelves(null)
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
      mix: recommend(universe, profile, { limit: 14, genresOf: genresFor, boost, similarArtists }),
      discover: recommend(universe, profile, { limit: 14, maxFamiliarity: 0.3, exclude: seenRecent, genresOf: genresFor, boost, similarArtists }),
      because: recent[0]
        ? recommend(universe, profile, { limit: 12, exclude: new Set([refKey(recent[0].ref)]), genresOf: genresFor, boost: coListeningScores(buildCoListening(events), [refKey(recent[0].ref)]), similarArtists })
        : []
    }
    // artistGenres/liked/catalog change what the universe and genre lookups return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, recent, catalog, liked, artistGenres, genresFor, similar])

  const heroCovers = mix.slice(0, 3)
  const minutes = Math.round(events.reduce((n, e) => n + e.listenedMs, 0) / 60_000)

  return (
    <div className="page-pad home">
      <header className="home-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="display">{greeting()}</h1>
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

      <div className="quick-grid">
        <QuickTile title="Liked songs" sub={`${liked.length} songs`} tracks={liked} icon="heart-fill" />
        {playlists.slice(0, 3).map((p) => (
          <QuickTile key={p.id} title={p.name} sub={`${p.tracks.length} songs`} tracks={p.tracks} />
        ))}
        {recent.slice(0, 4 - Math.min(3, playlists.length)).map((t) => (
          <QuickTile key={refKey(t.ref)} title={t.title} sub={t.artists.join(', ')} tracks={[t]} />
        ))}
        <button className="quick quick-radio" onClick={() => go({ name: 'radio' })}>
          <span className="quick-art">
            <Icon name="radio" size={22} />
          </span>
          <span className="quick-text">
            <span className="row-title">Live radio</span>
            <span className="row-sub">Stations from around the world</span>
          </span>
        </button>
      </div>

      {mix.length > 0 && (
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Daily mix</p>
            <h2 className="title-1">Made for you</h2>
            <p className="muted">{events.length ? 'Built from what you play, skip and listen to together.' : 'Starts generic and gets sharper with every song you play.'}</p>
            <div className="hero-actions">
              <button className="pill big" onClick={() => playTracks(mix)}>
                <Icon name="play" size={16} /> Play mix
              </button>
              <button
                className="pill ghost"
                onClick={() => {
                  const s = usePlayer.getState()
                  if (!s.shuffle) s.toggleShuffle()
                  playTracks(mix)
                }}
              >
                <Icon name="shuffle" size={16} /> Shuffle
              </button>
            </div>
          </div>
          <div className="hero-stack" aria-hidden>
            {heroCovers.map((t, i) => (
              <div key={refKey(t.ref)} className={`hero-cover c${i}`}>
                <Cover track={t} fill radius={20} />
              </div>
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
      {shelves?.map((s) => (
        <Shelf key={s.id} title={s.title} tracks={s.tracks} live={s.id.startsWith('radio')} />
      ))}
    </div>
  )
}
