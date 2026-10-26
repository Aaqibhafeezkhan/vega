import { useCallback, useEffect, useState } from 'react'
import type { FolderInfo, ScanProgress } from '@shared/library'
import { backend } from '@/lib/backend'
import { useCatalog } from '@/store/catalog'
import { useOnline } from '@/store/online'

function ago(ts: number | null): string {
  if (!ts) return 'never scanned'
  const m = Math.round((Date.now() - ts) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export function Sources() {
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [progress, setProgress] = useState<Record<string, ScanProgress>>({})
  const { demo, setDemo, localCount, refresh } = useCatalog()
  const online = useOnline()
  const [keyDraft, setKeyDraft] = useState(online.jamendoClientId)

  const reload = useCallback(async () => {
    setFolders(await backend.folders())
    void refresh()
  }, [refresh])

  useEffect(() => {
    void reload()
    return backend.onScanProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.folderId]: p }))
      if (p.phase === 'done' || p.phase === 'error') void reload()
    })
  }, [reload])

  const onlineSection = (
    <>
      <h2 className="section">Online sources</h2>
      <div className="panel toggle-row">
        <div>
          <div className="row-title">Audius</div>
          <div className="row-sub">Independent artists, millions of tracks. No account or key needed.</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={online.audius} onChange={(e) => online.setAudius(e.target.checked)} />
          <span />
        </label>
      </div>
      <div className="panel toggle-row">
        <div className="grow">
          <div className="row-title">Jamendo</div>
          <div className="row-sub">
            Creative-Commons music. Needs a free client ID from{' '}
            <a href="https://devportal.jamendo.com" target="_blank" rel="noreferrer">
              devportal.jamendo.com
            </a>
            .
          </div>
        </div>
        <input
          className="key-input"
          placeholder="Client ID"
          value={keyDraft}
          spellCheck={false}
          onChange={(e) => setKeyDraft(e.target.value)}
          onBlur={() => online.setJamendoClientId(keyDraft)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
    </>
  )

  if (!backend.supported) {
    return (
      <div className="view">
        <h1>Sources</h1>
        <div className="banner">
          This browser cannot open local folders. Use Chrome, Edge or the Vega desktop app to add your own music. Online sources work everywhere.
        </div>
        {onlineSection}
      </div>
    )
  }

  return (
    <div className="view">
      <div className="shelf-head">
        <div>
          <h1>Sources</h1>
          <div className="muted">
            {backend.kind === 'web' ? 'Files stay on your computer; the browser reads them directly.' : 'Folders are scanned into a local database.'}{' '}
            {localCount} tracks in your library.
          </div>
        </div>
        <div className="actions">
          {folders.length > 0 && (
            <button className="pill ghost" onClick={() => void backend.rescan()}>
              Rescan all
            </button>
          )}
          <button
            className="pill big"
            onClick={async () => {
              await backend.addFolder()
              void reload()
            }}
          >
            Add music folder
          </button>
        </div>
      </div>

      {!folders.length && <div className="banner">No folders yet. Add the folder where your music lives (mp3, flac, m4a, ogg, opus, wav).</div>}

      <div className="panel">
        {folders.map((f) => {
          const p = progress[f.id]
          const busy = p && (p.phase === 'walking' || p.phase === 'reading')
          return (
            <div className="folder" key={f.id}>
              <div className="row-main">
                <div className="row-title">{f.path}</div>
                <div className="row-sub">
                  {f.trackCount} tracks · {busy ? (p.phase === 'walking' ? `finding files… ${p.total || ''}` : `reading tags ${p.scanned}/${p.total}`) : ago(f.lastScan)}
                  {p?.phase === 'error' && <span className="err"> · {p.message}</span>}
                </div>
                {busy && p.phase === 'reading' && (
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${p.total ? (p.scanned / p.total) * 100 : 0}%` }} />
                  </div>
                )}
              </div>
              {f.needsPermission && (
                <button
                  className="pill"
                  onClick={async () => {
                    await backend.grantAccess?.(f.id)
                    void reload()
                  }}
                >
                  Reconnect
                </button>
              )}
              <button className="pill ghost" disabled={!!busy} onClick={() => void backend.rescan(f.id)}>
                Rescan
              </button>
              <button
                className="pill ghost"
                onClick={async () => {
                  await backend.removeFolder(f.id)
                  void reload()
                }}
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      {onlineSection}

      <div className="panel toggle-row">
        <div>
          <div className="row-title">Demo catalog</div>
          <div className="row-sub">Fictional songs with synthesized audio, handy for trying Vega before adding music.</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          <span />
        </label>
      </div>
    </div>
  )
}
