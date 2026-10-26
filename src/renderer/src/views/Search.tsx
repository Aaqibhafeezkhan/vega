import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { TrackList } from '@/components/TrackList'
import { sources } from '@/lib/sources'
import { useUi } from '@/store/ui'

export function Search() {
  const query = useUi((s) => s.query)
  const setQuery = useUi((s) => s.setQuery)
  const [results, setResults] = useState<Track[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setBusy(false)
      return
    }
    const ctl = new AbortController()
    setBusy(true)
    const timer = setTimeout(() => {
      sources
        .search(query, { signal: ctl.signal, onPartial: (t) => !ctl.signal.aborted && setResults(t) })
        .then((t) => {
          if (ctl.signal.aborted) return
          setResults(t)
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
