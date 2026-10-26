import { Cover } from './Cover'
import { Icon } from './Icon'
import type { Track } from '@shared/types'
import { usePlayer } from '@/store/player'

export function Shelf({ title, subtitle, tracks }: { title: string; subtitle?: string; tracks: Track[] }) {
  const playTracks = usePlayer((s) => s.playTracks)
  if (!tracks.length) return null
  return (
    <section className="shelf">
      <div className="shelf-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        <button className="pill" onClick={() => playTracks(tracks)}>
          <Icon name="play" size={14} /> Play all
        </button>
      </div>
      <div className="cards">
        {tracks.map((t, i) => (
          <button key={`${t.ref.id}-${i}`} className="card" onClick={() => playTracks(tracks, i)}>
            <div className="card-cover">
              <Cover track={t} size={150} radius={12} />
              <span className="card-play">
                <Icon name="play" size={20} />
              </span>
            </div>
            <div className="row-title">{t.title}</div>
            <div className="row-sub">{t.artists.join(', ')}</div>
          </button>
        ))}
      </div>
    </section>
  )
}
