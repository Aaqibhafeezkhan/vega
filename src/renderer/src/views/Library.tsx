import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { TrackList } from '@/components/TrackList'
import { Icon } from '@/components/Icon'
import { fmtMinutes } from '@/lib/format'

export function Library() {
  const liked = useLibrary((s) => s.liked)
  const playTracks = usePlayer((s) => s.playTracks)
  const mins = Math.round(liked.reduce((n, t) => n + t.durationMs, 0) / 60_000)
  return (
    <div className="view">
      <div className="hero">
        <div className="hero-art liked">
          <Icon name="heart-fill" size={56} />
        </div>
        <div>
          <div className="eyebrow">Library</div>
          <h1>Liked songs</h1>
          <div className="muted">
            {liked.length} songs · {fmtMinutes(mins)}
          </div>
          <button className="pill big" disabled={!liked.length} onClick={() => playTracks(liked)}>
            <Icon name="play" size={16} /> Play
          </button>
        </div>
      </div>
      {!liked.length && <div className="muted pad">Tap the heart on any song to save it here.</div>}
      <TrackList tracks={liked} />
    </div>
  )
}
