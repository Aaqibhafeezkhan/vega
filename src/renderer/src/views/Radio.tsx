import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { RADIO_GENRES } from '@providers/radio'
import { Icon } from '@/components/Icon'
import { Shelf } from '@/components/Shelf'
import { radio } from '@/lib/sources'
import { usePlayer } from '@/store/player'

/** Live stations from radio-browser.info: search by name, or browse by genre. */
export function Radio() {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string>('pop')
  const [stations, setStations] = useState<Track[] | null>(null)
  const [error, setError] = useState(false)
  const playTracks = usePlayer((s) => s.playTracks)

  useEffect(() => {
    const ctl = new AbortController()
    setStations(null)
    setError(false)
    const t = setTimeout(() => {
      radio
        .stations({ name: q.trim() || undefined, tag: q.trim() ? undefined : tag, limit: 36, signal: ctl.signal })
        .then((s) => !ctl.signal.aborted && setStations(s))
        .catch(() => !ctl.signal.aborted && (setError(true), setStations([])))
    }, q ? 300 : 0)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q, tag])

  return (
    <div className="page-pad">
      <header className="page-head">
        <div>
          <p className="eyebrow">Live</p>
          <h1 className="display">Live <em>radio</em></h1>
          <p className="muted">Thousands of stations, streaming now. Powered by the community radio-browser directory.</p>
        </div>
      </header>

      <label className="searchbox">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a station by name" aria-label="Find a station" />
      </label>

      {!q && (
        <div className="chips" role="tablist" aria-label="Genres">
          {RADIO_GENRES.map((g) => (
            <button key={g} role="tab" aria-selected={tag === g} className={`chip${tag === g ? ' on' : ''}`} onClick={() => setTag(g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      {stations === null && (
        <div className="cards wrap">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 16 }} />
              <div className="skeleton" style={{ height: 14, marginTop: 10, width: '75%' }} />
            </div>
          ))}
        </div>
      )}
      {stations && stations.length > 0 && (
        <>
          <div className="actions">
            <button className="pill big" onClick={() => playTracks(stations)}>
              <Icon name="play" size={16} /> Play {q ? 'results' : tag}
            </button>
          </div>
          <Shelf title={q ? `Results for “${q}”` : `${tag[0]!.toUpperCase()}${tag.slice(1)} stations`} tracks={stations} live />
        </>
      )}
      {stations && !stations.length && (
        <div className="empty">
          <Icon name="radio" size={30} />
          <p>{error ? 'Could not reach the radio directory' : 'No stations found'}</p>
          <span className="muted small">{error ? 'Check your connection and try again.' : 'Try another name or genre.'}</span>
        </div>
      )}
    </div>
  )
}
