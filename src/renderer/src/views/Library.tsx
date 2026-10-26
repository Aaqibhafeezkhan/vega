import { useMemo, useState } from 'react'
import { Cover } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { TrackList } from '@/components/TrackList'
import { fmtMinutes } from '@/lib/format'
import { recentTracks } from '@/lib/recommender'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'

type Tab = 'liked' | 'playlists' | 'history'

export function Library() {
  const liked = useLibrary((s) => s.liked)
  const playlists = useLibrary((s) => s.playlists)
  const smart = useLibrary((s) => s.smart)
  const events = useLibrary((s) => s.events)
  const playTracks = usePlayer((s) => s.playTracks)
  const go = useUi((s) => s.go)
  const [tab, setTab] = useState<Tab>('liked')
  const mins = Math.round(liked.reduce((n, t) => n + t.durationMs, 0) / 60_000)
  const history = useMemo(() => recentTracks(events, 100), [events])

  return (
    <div className="page-pad">
      <header className="hero-head">
        <div className="hero-art liked">
          <Icon name="heart-fill" size={64} />
        </div>
        <div className="hero-body">
          <p className="eyebrow">Your library</p>
          <h1 className="display">
            Liked <em>songs</em>
          </h1>
          <p className="muted">
            {liked.length} songs · {fmtMinutes(mins)} · {playlists.length + smart.length} playlists
          </p>
          <div className="actions">
            <button className="pill big" disabled={!liked.length} onClick={() => playTracks(liked)}>
              <Icon name="play" size={16} /> Play
            </button>
            <button
              className="pill ghost"
              disabled={!liked.length}
              onClick={() => {
                const s = usePlayer.getState()
                if (!s.shuffle) s.toggleShuffle()
                playTracks(liked)
              }}
            >
              <Icon name="shuffle" size={16} /> Shuffle
            </button>
          </div>
        </div>
      </header>

      <div className="chips" role="tablist">
        {(['liked', 'playlists', 'history'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`chip${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t === 'liked' ? 'Liked' : t === 'playlists' ? 'Playlists' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'liked' && (
        <>
          {!liked.length && (
            <div className="empty">
              <Icon name="heart" size={30} />
              <p>Nothing liked yet</p>
              <span className="muted small">Tap the heart on any song to keep it here.</span>
            </div>
          )}
          {liked.length > 0 && <TrackList tracks={liked} />}
        </>
      )}

      {tab === 'playlists' && (
        <div className="cards wrap">
          <button className="card new" onClick={() => go({ name: 'smart', id: 'new' })}>
            <div className="card-cover newbox">
              <Icon name="spark" size={34} />
            </div>
            <div className="row-title">New smart playlist</div>
            <div className="row-sub">Rules that update themselves</div>
          </button>
          {smart.map((p) => (
            <button key={p.id} className="card" onClick={() => go({ name: 'smart', id: p.id })}>
              <div className="card-cover newbox smartbox">
                <Icon name="spark" size={34} />
              </div>
              <div className="row-title">{p.name}</div>
              <div className="row-sub">Smart playlist</div>
            </button>
          ))}
          {playlists.map((p) => (
            <button key={p.id} className="card" onClick={() => go({ name: 'playlist', id: p.id })}>
              <div className="card-cover">
                {p.tracks[0] ? <Cover track={p.tracks[0]} fill radius={16} /> : <div className="newbox"><Icon name="note" size={34} /></div>}
              </div>
              <div className="row-title">{p.name}</div>
              <div className="row-sub">{p.tracks.length} songs</div>
            </button>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <>
          {!history.length && (
            <div className="empty">
              <Icon name="clock" size={30} />
              <p>No listening history yet</p>
              <span className="muted small">Songs you play show up here.</span>
            </div>
          )}
          {history.length > 0 && <TrackList tracks={history} numbered={false} />}
        </>
      )}
    </div>
  )
}
