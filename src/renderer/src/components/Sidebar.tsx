import { useState } from 'react'
import { refKey } from '@shared/types'
import { useAuth } from '@/store/auth'
import { useLibrary } from '@/store/library'
import { useUi, type View } from '@/store/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

const NAV: { view: View; label: string; icon: string }[] = [
  { view: { name: 'home' }, label: 'Home', icon: 'home' },
  { view: { name: 'search' }, label: 'Search', icon: 'search' },
  { view: { name: 'library' }, label: 'Library', icon: 'library' },
  { view: { name: 'radio' }, label: 'Radio', icon: 'radio' },
  { view: { name: 'stats' }, label: 'Insights', icon: 'stats' },
  { view: { name: 'sources' }, label: 'Sources', icon: 'folder' }
]

function Mosaic({ ids }: { ids: number[] }) {
  return (
    <span className="mosaic" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} style={{ background: `hsl(${(ids[i % Math.max(1, ids.length)] ?? 200 + i * 40) % 360} 55% ${30 + i * 5}%)` }} />
      ))}
    </span>
  )
}

export function Sidebar() {
  const view = useUi((s) => s.view)
  const go = useUi((s) => s.go)
  const playlists = useLibrary((s) => s.playlists)
  const smart = useLibrary((s) => s.smart)
  const liked = useLibrary((s) => s.liked)
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
    <aside className="rail" aria-label="Navigation">
      <button className="brand" onClick={() => go({ name: 'home' })} aria-label="Vega home">
        <span className="brand-star">
          <Icon name="spark" size={20} strokeWidth={2} />
        </span>
        <span className="brand-name">Vega</span>
      </button>

      <nav className="rail-nav">
        {NAV.map((n) => (
          <button key={n.label} className={`nav-item${view.name === n.view.name ? ' on' : ''}`} onClick={() => go(n.view)} title={n.label}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="rail-head">
        <span>Your space</span>
        <span className="rail-actions">
          <button className="icon-btn sm" onClick={() => go({ name: 'smart', id: 'new' })} aria-label="New smart playlist" title="New smart playlist">
            <Icon name="spark" size={15} />
          </button>
          <button className="icon-btn sm" onClick={() => setNaming(true)} aria-label="New playlist" title="New playlist">
            <Icon name="plus" size={16} />
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

      <div className="rail-list">
        <button className={`space-item${view.name === 'library' ? ' on' : ''}`} onClick={() => go({ name: 'library' })}>
          <span className="space-art liked">
            <Icon name="heart-fill" size={16} />
          </span>
          <span className="space-text">
            <span>Liked songs</span>
            <span className="muted small">{liked.length} songs</span>
          </span>
        </button>
        {smart.map((p) => (
          <button key={p.id} className={`space-item${view.name === 'smart' && view.id === p.id ? ' on' : ''}`} onClick={() => go({ name: 'smart', id: p.id })}>
            <span className="space-art smart">
              <Icon name="spark" size={16} />
            </span>
            <span className="space-text">
              <span>{p.name}</span>
              <span className="muted small">Smart playlist</span>
            </span>
          </button>
        ))}
        {playlists.map((p) => (
          <button key={p.id} className={`space-item${view.name === 'playlist' && view.id === p.id ? ' on' : ''}`} onClick={() => go({ name: 'playlist', id: p.id })}>
            <span className="space-art">
              {p.tracks[0] ? <Cover track={p.tracks[0]} size={40} radius={8} /> : <Mosaic ids={p.tracks.map((t) => refKey(t.ref).length * 37)} />}
            </span>
            <span className="space-text">
              <span>{p.name}</span>
              <span className="muted small">{p.tracks.length} songs</span>
            </span>
          </button>
        ))}
      </div>

      <button className={`account-chip${view.name === 'account' ? ' on' : ''}`} onClick={() => go({ name: 'account' })}>
        <span className={`avatar sync-${auth.user ? auth.sync : 'off'}`}>{auth.user?.email?.charAt(0).toUpperCase() ?? <Icon name="user" size={16} />}</span>
        <span className="account-text">
          <span>{auth.user ? (auth.user.user_metadata?.display_name ?? auth.user.email) : 'Sign in'}</span>
          <span className="muted small">{!auth.enabled ? 'Local only' : auth.user ? (auth.sync === 'syncing' ? 'Syncing…' : auth.sync === 'error' ? 'Sync problem' : 'Synced') : 'Sync across devices'}</span>
        </span>
      </button>
    </aside>
  )
}
