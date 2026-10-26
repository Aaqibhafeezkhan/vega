import { useState } from 'react'
import { useLibrary } from '@/store/library'
import { useUi, type View } from '@/store/ui'
import { Icon } from './Icon'

const NAV: { view: View; label: string; icon: string }[] = [
  { view: { name: 'home' }, label: 'Home', icon: 'home' },
  { view: { name: 'search' }, label: 'Search', icon: 'search' },
  { view: { name: 'library' }, label: 'Library', icon: 'library' },
  { view: { name: 'stats' }, label: 'Insights', icon: 'stats' }
]

export function Sidebar() {
  const view = useUi((s) => s.view)
  const go = useUi((s) => s.go)
  const playlists = useLibrary((s) => s.playlists)
  const createPlaylist = useLibrary((s) => s.createPlaylist)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const commit = (): void => {
    if (name.trim()) go({ name: 'playlist', id: createPlaylist(name) })
    setName('')
    setNaming(false)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <Icon name="star" size={22} />
        <span>Vega</span>
      </div>
      <nav>
        {NAV.map((n) => (
          <button key={n.label} className={`nav-item${view.name === n.view.name ? ' on' : ''}`} onClick={() => go(n.view)}>
            <Icon name={n.icon} size={20} />
            {n.label}
          </button>
        ))}
      </nav>
      <div className="side-head">
        <span>Playlists</span>
        <button className="icon-btn" onClick={() => setNaming(true)} aria-label="New playlist">
          <Icon name="plus" size={18} />
        </button>
      </div>
      {naming && (
        <input
          className="side-input"
          autoFocus
          placeholder="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setName('')
              setNaming(false)
            }
          }}
        />
      )}
      <div className="side-list">
        {playlists.map((p) => (
          <button
            key={p.id}
            className={`nav-item sub${view.name === 'playlist' && view.id === p.id ? ' on' : ''}`}
            onClick={() => go({ name: 'playlist', id: p.id })}
          >
            {p.name}
            <span className="count">{p.tracks.length}</span>
          </button>
        ))}
        {!playlists.length && !naming && <div className="muted small">No playlists yet</div>}
      </div>
    </aside>
  )
}
