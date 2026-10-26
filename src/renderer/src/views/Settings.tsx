import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/ipc'
import { Icon } from '@/components/Icon'
import { load, save } from '@/lib/persist'
import { detectPlatform, fetchDownloads, type Downloads } from '@/lib/downloads'
import { checkForUpdate, installUpdate, isAndroidApp, startDownload, useAndroidUpdate } from '@/lib/androidUpdate'
import { clearOffline, offlineStats } from '@/lib/offline'
import { pingsEnabled, setPingsEnabled } from '@/lib/trending'
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

function OfflinePanel() {
  const [s, setS] = useState({ count: 0, bytes: 0 })
  useEffect(() => {
    void offlineStats().then(setS)
  }, [])
  return (
    <div className="panel toggle-row">
      <div className="grow">
        <div className="row-title">Offline songs on this device</div>
        <div className="row-sub">
          {s.count ? `${s.count} saved · ${(s.bytes / 1048576).toFixed(0)} MB.` : 'None yet.'} Use "Save for offline" in a song's menu (Audius, Jamendo and Internet Archive tracks). Copies stay on this device only.
        </div>
      </div>
      <button
        className="pill ghost"
        disabled={!s.count}
        onClick={() => {
          void clearOffline().then(() => setS({ count: 0, bytes: 0 }))
        }}
      >
        Clear
      </button>
    </div>
  )
}

function PrivacyPanel() {
  const [on, setOn] = useState(pingsEnabled)
  return (
    <div className="panel toggle-row">
      <div className="grow">
        <div className="row-title">Count my plays for Trending</div>
        <div className="row-sub">Adds one anonymous tick (song only, no account, no device id) when you finish listening to a YouTube Music track.</div>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={on}
          aria-label="Count my plays for Trending"
          onChange={(e) => {
            setPingsEnabled(e.target.checked)
            setOn(e.target.checked)
          }}
        />
        <span />
      </label>
    </div>
  )
}

function GetAppPanel() {
  const platform = detectPlatform()
  const [d, setD] = useState<Downloads | null>(null)
  useEffect(() => {
    void fetchDownloads().then(setD)
  }, [])
  const link = (href: string | null, label: string, primary: boolean) =>
    href ? (
      <a className={primary ? 'pill big' : 'pill ghost'} href={href}>
        <Icon name="download" size={16} /> {label}
      </a>
    ) : null
  const win = link(d?.windows ?? null, 'Download for Windows', platform !== 'android')
  const and = link(d?.android ?? null, 'Download for Android', platform === 'android')
  // the visitor's own platform first
  const order = platform === 'android' ? [and] : [win, and]
  const missing = d && !(platform === 'android' ? d.android : d.windows)
  return (
    <div className="panel">
      <h3>Get the app{d?.version ? ` · v${d.version}` : ''}</h3>
      <p className="muted">
        {platform === 'android'
          ? 'The Android app keeps playing with the screen off and shows lock-screen controls.'
          : 'The desktop app adds offline playback, your own music folders, the equalizer and music-video backgrounds.'}
      </p>
      <div className="actions">
        {order}
        {d && (missing || (!win && !and)) && (
          <a className="pill ghost" href={d?.page ?? 'https://github.com/DhruvHarani1/vega/releases/latest'} target="_blank" rel="noreferrer">
            {missing ? `${platform === 'android' ? 'Android' : 'Windows'} build not published yet: see all releases` : 'All releases'}
          </a>
        )}
      </div>
    </div>
  )
}

function AndroidUpdatesPanel() {
  const u = useAndroidUpdate()
  const [auto, setAuto] = useState(() => load<boolean>('update.auto', true))
  const line =
    u.state === 'checking'
      ? 'Checking for updates…'
      : u.state === 'available'
        ? `Vega ${u.latest} is available.`
        : u.state === 'downloading'
          ? `Downloading Vega ${u.latest}… ${u.percent}%`
          : u.state === 'ready'
            ? `Vega ${u.latest} is ready to install.`
            : u.state === 'installing'
              ? 'Installing… confirm in the Android dialog if it appears.'
              : u.state === 'none'
                ? 'You have the latest version.'
                : u.state === 'error'
                  ? `Update problem: ${u.message}`
                  : 'Updates are checked automatically in the background.'
  return (
    <div className="panel">
      <h3>Updates</h3>
      <div className="toggle-row">
        <div className="grow">
          <div className="row-title">Vega {u.installed}</div>
          <div className={`row-sub${u.state === 'error' ? ' err' : ''}`}>{line}</div>
          {u.state === 'downloading' && (
            <div className="bar-track" style={{ marginTop: 8 }}>
              <div className="bar-fill" style={{ width: `${u.percent}%` }} />
            </div>
          )}
        </div>
        {u.state === 'ready' ? (
          <button className="pill big" onClick={installUpdate}>
            Install update
          </button>
        ) : u.state === 'available' ? (
          <button className="pill big" onClick={startDownload}>
            Download
          </button>
        ) : (
          <button className="pill ghost" disabled={u.state === 'checking' || u.state === 'downloading' || u.state === 'installing'} onClick={() => void checkForUpdate()}>
            Check now
          </button>
        )}
      </div>
      <div className="toggle-row" style={{ marginTop: 16 }}>
        <div className="grow">
          <div className="row-title">Download updates automatically</div>
          <div className="row-sub">New versions download in the background; you confirm the install.</div>
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

  if (!api && isAndroidApp()) return <AndroidUpdatesPanel />
  if (!api) {
    return (
      <>
        <div className="panel">
          <h3>Updates</h3>
          <p className="muted">You are using the web version, which is always the latest.</p>
        </div>
        {!(window as unknown as { __vegaAndroid?: unknown }).__vegaAndroid && <GetAppPanel />}
      </>
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

      <PrivacyPanel />
      {!window.vega && <OfflinePanel />}

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
