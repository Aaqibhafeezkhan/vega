import { useEffect, useMemo, useState } from 'react'
import { buildProfile, rankSearch } from '@shared/recs'
import { refKey, type Track } from '@shared/types'
import { Icon } from '@/components/Icon'
import { TrackList } from '@/components/TrackList'
import { sources } from '@/lib/sources'
import { useLibrary } from '@/store/library'
import { useMeta } from '@/store/meta'
import { useUi } from '@/store/ui'

const SOURCE_NAMES: Record<string, string> = { local: 'My music', audius: 'Audius', jamendo: 'Jamendo', archive: 'Internet Archive', mock: 'Demo' }

export function Search() {
  const query = useUi((s) => s.query)
  const [raw, setRaw] = useState<Track[]>([])
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const events = useLibrary((s) => s.events)
  const liked = useLibrary((s) => s.liked)

  const ranked = useMemo(() => rankSearch(raw, buildProfile(events), new Set(liked.map((t) => refKey(t.ref))), query), [raw, events, liked, query])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of ranked) m.set(t.ref.source, (m.get(t.ref.source) ?? 0) + 1)
    return m
  }, [ranked])
  const results = filter === 'all' ? ranked : ranked.filter((t) => t.ref.source === filter)

  useEffect(() => {
    if (!query.trim()) {
      setRaw([])
      setBusy(false)
      return
    }
    const ctl = new AbortController()
    setBusy(true)
    const timer = setTimeout(() => {
      sources
        .search(query, { signal: ctl.signal, onPartial: (t) => !ctl.signal.aborted && setRaw(t) })
        .then((t) => {
          if (ctl.signal.aborted) return
          setRaw(t)
          useMeta.getState().request(t)
          setBusy(false)
        })
        .catch(() => !ctl.signal.aborted && setBusy(false))
    }, 200)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [query])

  useEffect(() => {
    if (filter !== 'all' && !counts.has(filter)) setFilter('all')
  }, [counts, filter])

  return (
    <div className="page-pad">
      <header className="page-head">
        <div>
          <p className="eyebrow">Search</p>
          <h1 className="display">{query.trim() ? <>Results for <em>{query.trim()}</em></> : 'Find your sound'}</h1>
        </div>
      </header>

      {!query.trim() && (
        <div className="empty">
          <Icon name="search" size={30} />
          <p>Search across your library and every source at once</p>
          <span className="muted small">Try “synthwave”, “jazz”, or an artist you love. Press / to jump here from anywhere.</span>
        </div>
      )}

      {query.trim() && (
        <>
          <div className="chips" role="tablist" aria-label="Filter by source">
            <button role="tab" aria-selected={filter === 'all'} className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
              All · {ranked.length}
            </button>
            {[...counts.entries()].map(([src, n]) => (
              <button key={src} role="tab" aria-selected={filter === src} className={`chip${filter === src ? ' on' : ''}`} onClick={() => setFilter(src)}>
                {SOURCE_NAMES[src] ?? src} · {n}
              </button>
            ))}
            {busy && <span className="chip-busy">Searching sources…</span>}
          </div>

          {!busy && !results.length && (
            <div className="empty">
              <Icon name="disc" size={30} />
              <p>No results for “{query}”</p>
              <span className="muted small">Check the spelling, or add more sources under Sources.</span>
            </div>
          )}
          {results.length > 0 && <TrackList tracks={results} />}
        </>
      )}
    </div>
  )
}
