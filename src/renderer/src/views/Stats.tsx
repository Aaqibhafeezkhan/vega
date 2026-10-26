import { useMemo } from 'react'
import { summarize } from '@shared/stats'
import { Cover } from '@/components/Cover'
import { fmtMinutes } from '@/lib/format'
import { useLibrary } from '@/store/library'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Bars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <div className="bar-label">
            {r.label}
            {r.sub && <span className="muted small"> {r.sub}</span>}
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="bar-val">{r.value}</div>
        </div>
      ))}
    </div>
  )
}

export function Stats() {
  const events = useLibrary((s) => s.events)
  const seed = useLibrary((s) => s.seedDemoHistory)
  const clear = useLibrary((s) => s.clearHistory)
  const s = useMemo(() => summarize(events), [events])

  if (!events.length) {
    return (
      <div className="view">
        <h1>Insights</h1>
        <div className="banner">
          <div>No listening history yet. Play some songs, or load sample data to see what this page does.</div>
          <button className="pill" onClick={seed}>
            Load demo history
          </button>
        </div>
      </div>
    )
  }

  const clockMax = Math.max(1, ...s.clock.flat())
  return (
    <div className="view">
      <div className="shelf-head">
        <h1>Insights</h1>
        <button className="pill ghost" onClick={clear}>
          Clear history
        </button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-val">{s.plays}</div><div className="muted">plays</div></div>
        <div className="kpi"><div className="kpi-val">{fmtMinutes(s.minutes)}</div><div className="muted">listened</div></div>
        <div className="kpi"><div className="kpi-val">{s.uniqueArtists}</div><div className="muted">artists</div></div>
        <div className="kpi"><div className="kpi-val">{Math.round(s.skipRate * 100)}%</div><div className="muted">skip rate</div></div>
        <div className="kpi"><div className="kpi-val">{s.streakDays}d</div><div className="muted">streak</div></div>
      </div>

      <div className="grid2">
        <section className="panel">
          <h3>Top artists</h3>
          <Bars rows={s.topArtists.map((a) => ({ label: a.artist, value: a.plays, sub: `${a.minutes} min` }))} />
        </section>
        <section className="panel">
          <h3>Top genres</h3>
          <Bars rows={s.topGenres.map((g) => ({ label: g.genre, value: g.plays }))} />
        </section>
      </div>

      <section className="panel">
        <h3>Listening clock</h3>
        <div className="clock">
          {s.clock.map((row, d) => (
            <div className="clock-row" key={d}>
              <span className="clock-day">{DAYS[d]}</span>
              {row.map((v, h) => (
                <span key={h} className="clock-cell" title={`${DAYS[d]} ${h}:00 · ${v} plays`} style={{ opacity: v ? 0.18 + (v / clockMax) * 0.82 : 0.06 }} />
              ))}
            </div>
          ))}
          <div className="clock-row">
            <span className="clock-day" />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="clock-hour">{h % 6 === 0 ? h : ''}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Top tracks</h3>
        {s.topTracks.map((t, i) => (
          <div className="mini-row" key={`${t.track.ref.id}`}>
            <span className="num">{i + 1}</span>
            <Cover track={t.track} size={36} radius={6} />
            <div className="row-main">
              <div className="row-title">{t.track.title}</div>
              <div className="row-sub">{t.track.artists.join(', ')}</div>
            </div>
            <span className="muted">{t.plays} plays</span>
          </div>
        ))}
      </section>
    </div>
  )
}
