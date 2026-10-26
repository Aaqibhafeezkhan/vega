import { useState } from 'react'
import { useLibrary } from '@/store/library'
import { useAuth } from '@/store/auth'
import { useUi, type View } from '@/store/ui'
import { Icon } from './Icon'

const NAV: { view: View; label: string; icon: string }[] = [
  { view: { name: 'home' }, label: 'Home', icon: 'home' },
  { view: { name: 'search' }, label: 'Search', icon: 'search' },
  { view: { name: 'library' }, label: 'Library', icon: 'library' },
  { view: { name: 'stats' }, label: 'Insights', icon: 'stats' },
  { view: { name: 'sources' }, label: 'Sources', icon: 'folder' }
]

export function Sidebar() {
  const view = useUi((s) => s.view)
  const go = useUi((s) => s.go)
  const playlists = useLibrary((s) => s.playlists)
  const smart = useLibrary((s) => s.smart)
  const createPlaylist = useLibrary((s) => s.createPlaylist)
  const auth = useAuth()
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
        <span className="side-actions">
          <button className="icon-btn" onClick={() => go({ name: 'smart', id: 'new' })} aria-label="New smart playlist" title="New smart playlist">
            <Icon name="star" size={16} />
          </button>
          <button className="icon-btn" onClick={() => setNaming(true)} aria-label="New playlist" title="New playlist">
            <Icon name="plus" size={18} />
          </button>
        </span>
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
        {smart.map((p) => (
          <button key={p.id} className={`nav-item sub${view.name === 'smart' && view.id === p.id ? ' on' : ''}`} onClick={() => go({ name: 'smart', id: p.id })}>
            <span className="smart-mark">✦</span>
            {p.name}
          </button>
        ))}
        {!playlists.length && !smart.length && !naming && <div className="muted small">No playlists yet</div>}
      </div>
      <button className={`account-chip${view.name === 'account' ? ' on' : ''}`} onClick={() => go({ name: 'account' })}>
        <span className={`avatar sync-${auth.user ? auth.sync : 'off'}`}>{auth.user?.email?.charAt(0).toUpperCase() ?? '?'}</span>
        <span className="account-text">
          <span>{auth.user ? (auth.user.user_metadata?.display_name ?? auth.user.email) : 'Sign in'}</span>
          <span className="muted small">
            {!auth.enabled ? 'Local only' : auth.user ? (auth.sync === 'syncing' ? 'Syncing…' : auth.sync === 'error' ? 'Sync problem' : 'Synced') : 'Sync across devices'}
          </span>
        </span>
      </button>
    </aside>
  )
}
