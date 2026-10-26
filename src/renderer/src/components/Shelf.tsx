import { useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayer } from '@/store/player'
import { Cover } from './Cover'
import { Icon } from './Icon'

/** A horizontally scrolling row of artwork cards with arrow controls. */
export function Shelf({ title, subtitle, tracks, live = false }: { title: string; subtitle?: string; tracks: Track[]; live?: boolean }) {
  const playTracks = usePlayer((s) => s.playTracks)
  const current = usePlayer((s) => s.queue[s.index])
  const playing = usePlayer((s) => s.playing)
  const scroller = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  if (!tracks.length) return null

  const nudge = (dir: 1 | -1): void => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }
  const onScroll = (): void => {
    const el = scroller.current
    if (el) setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }

  return (
    <section className="shelf">
      <div className="shelf-head">
        <div>
          <h2 className="title-2">{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <div className="shelf-tools">
          <button className="chip" onClick={() => playTracks(tracks)}>
            <Icon name="play" size={12} /> Play all
          </button>
          <button className="icon-btn" onClick={() => nudge(-1)} disabled={edge.start} aria-label="Scroll left">
            <Icon name="chevron-left" size={18} />
          </button>
          <button className="icon-btn" onClick={() => nudge(1)} disabled={edge.end} aria-label="Scroll right">
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>
      <div className="cards" ref={scroller} onScroll={onScroll}>
        {tracks.map((t, i) => {
          const active = current?.ref.id === t.ref.id && current.ref.source === t.ref.source
          return (
            <button key={`${t.ref.source}:${t.ref.id}-${i}`} className={`card${active ? ' active' : ''}`} style={{ ['--i' as string]: Math.min(i, 10) }} onClick={() => playTracks(tracks, i)}>
              <div className="card-cover">
                <Cover track={t} fill radius={16} />
                <span className="card-play" aria-hidden>
                  <Icon name={active && playing ? 'pause' : 'play'} size={20} />
                </span>
                {live && <span className="badge-live">LIVE</span>}
              </div>
              <div className="row-title">{t.title}</div>
              <div className="row-sub">{t.artists.join(', ')}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
