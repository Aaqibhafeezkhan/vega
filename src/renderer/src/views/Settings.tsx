import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/ipc'
import { Icon } from '@/components/Icon'
import { load, save } from '@/lib/persist'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['Ctrl + K', 'Command palette'],
  ['/', 'Focus search'],
  ['L', 'Open the lyrics panel'],
  ['Ctrl + ← / →', 'Previous / next track'],
  ['Esc', 'Close panels and menus']
]

function UpdatesPanel() {
  const api = window.vega
  const [info, setInfo] = useState<{ version: string; packaged: boolean } | null>(null)
  const [u, setU] = useState<UpdateState>({ state: 'idle' })
  const [auto, setAuto] = useState(() => load<boolean>('update.auto', true))

  useEffect(() => {
    if (!api) return
    void api.app.info().then(setInfo)
    void api.update.get().then(setU)
    return api.update.onState(setU)
  }, [api])

  if (!api) {
    return (
      <div className="panel">
        <h3>Updates</h3>
        <p className="muted">You are using the web version, which is always the latest. Install the desktop app for offline playback, your own music folders and the equalizer.</p>
        <div className="actions">
          <a className="pill ghost" href="https://github.com/DhruvHarani1/vega/releases/latest" target="_blank" rel="noreferrer">
            Get the desktop app
          </a>
        </div>
      </div>
    )
  }

  const line =
    u.state === 'checking'
      ? 'Checking for updates…'
      : u.state === 'downloading'
        ? `Downloading Vega ${u.version ?? ''}… ${u.percent ?? 0}%`
        : u.state === 'ready'
          ? `Vega ${u.version} is ready. Restart to finish updating.`
          : u.state === 'none'
            ? 'You have the latest version.'
            : u.state === 'error'
              ? `Could not check for updates: ${u.message}`
              : u.state === 'disabled'
                ? (u.message ?? '')
                : 'Updates are checked automatically in the background.'

  return (
    <div className="panel">
      <h3>Updates</h3>
      <div className="toggle-row">
        <div className="grow">
          <div className="row-title">Vega {info?.version ?? ''}</div>
          <div className={`row-sub${u.state === 'error' ? ' err' : ''}`}>{line}</div>
          {u.state === 'downloading' && (
            <div className="bar-track" style={{ marginTop: 8 }}>
              <div className="bar-fill" style={{ width: `${u.percent ?? 0}%` }} />
            </div>
          )}
        </div>
        {u.state === 'ready' ? (
          <button className="pill big" onClick={() => void api.update.install()}>
            Restart to update
          </button>
        ) : (
          <button className="pill ghost" disabled={u.state === 'checking' || u.state === 'downloading' || u.state === 'disabled'} onClick={() => void api.update.check()}>
            Check now
          </button>
        )}
      </div>
      <div className="toggle-row" style={{ marginTop: 16 }}>
        <div className="grow">
          <div className="row-title">Update automatically</div>
          <div className="row-sub">Download new versions in the background and install them when you close Vega.</div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked)
              save('update.auto', e.target.checked)
            }}
          />
          <span />
        </label>
      </div>
    </div>
  )
}

export function Settings() {
  const go = useUi((s) => s.go)
  const user = useAuth((s) => s.user)

  return (
    <div className="page-pad narrow wide-ish">
      <header className="page-head">
        <div>
          <p className="eyebrow">Vega</p>
          <h1 className="display">Your <em>settings</em></h1>
        </div>
      </header>

      <UpdatesPanel />

      <div className="panel toggle-row">
        <div className="grow">
          <div className="row-title">Account and sync</div>
          <div className="row-sub">{user ? `Signed in as ${user.email}` : 'Sign in to keep your likes, playlists and history on every device.'}</div>
        </div>
        <button className="pill ghost" onClick={() => go({ name: 'account' })}>
          {user ? 'Manage' : 'Sign in'}
        </button>
      </div>

      <div className="panel toggle-row">
        <div className="grow">
          <div className="row-title">Music sources, offline cache and recommendations</div>
          <div className="row-sub">Local folders, Audius, Jamendo, Internet Archive, radio, YouTube tools, Last.fm.</div>
        </div>
        <button className="pill ghost" onClick={() => go({ name: 'sources' })}>
          Open Sources
        </button>
      </div>

      <div className="panel">
        <h3>Lyrics player (Lyra)</h3>
        <p className="muted">
          Open it from the lyrics button in the player bar. Its own settings (fonts, backgrounds, karaoke, YouTube key) are inside it, under the sliders icon.
        </p>
      </div>

      <div className="panel">
        <h3>Keyboard shortcuts</h3>
        <div className="shortcuts">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="shortcut">
              <kbd>{k}</kbd>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>About</h3>
        <p className="muted">
          Vega is open source (MIT).{' '}
          <a href="https://github.com/DhruvHarani1/vega" target="_blank" rel="noreferrer">
            github.com/DhruvHarani1/vega <Icon name="external" size={12} />
          </a>
        </p>
      </div>
    </div>
  )
}
