import { useEffect, useMemo, useState } from 'react'
import type { Track } from '@shared/types'
import { TrackList } from '@/components/TrackList'
import { buildProfile, rankSearch } from '@shared/recs'
import { refKey } from '@shared/types'
import { sources } from '@/lib/sources'
import { useLibrary } from '@/store/library'
import { useMeta } from '@/store/meta'
import { useUi } from '@/store/ui'

export function Search() {
  const query = useUi((s) => s.query)
  const setQuery = useUi((s) => s.setQuery)
  const [raw, setRaw] = useState<Track[]>([])
  const events = useLibrary((s) => s.events)
  const liked = useLibrary((s) => s.liked)
  const results = useMemo(
    () => rankSearch(raw, buildProfile(events), new Set(liked.map((t) => refKey(t.ref))), query),
    [raw, events, liked, query]
  )
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="view">
      <input
        className="search-input"
        autoFocus
        placeholder="Search songs, artists, albums, genres"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!query.trim() && <div className="muted pad">Try &ldquo;synthwave&rdquo;, &ldquo;jazz&rdquo; or &ldquo;Nova&rdquo;.</div>}
      {query.trim() && !busy && !results.length && <div className="muted pad">No results for &ldquo;{query}&rdquo;.</div>}
      {results.length > 0 && (
        <>
          <h2 className="section">Songs</h2>
          <TrackList tracks={results} />
        </>
      )}
    </div>
  )
}
