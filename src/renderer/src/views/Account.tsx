import { useState, type FormEvent } from 'react'
import { useAuth } from '@/store/auth'
import { useLibrary } from '@/store/library'

type Mode = 'signin' | 'signup' | 'reset'

function ago(ts: number | null): string {
  if (!ts) return 'not yet'
  const s = Math.round((Date.now() - ts) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}

export function Account() {
  const { enabled, ready, user, sync, syncError, lastSync, signIn, signUp, signOut, resetPassword, syncNow } = useAuth()
  const likes = useLibrary((s) => s.liked.length)
  const playlists = useLibrary((s) => s.playlists.length)
  const plays = useLibrary((s) => s.events.length)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  if (!enabled) {
    return (
      <div className="page-pad">
        <h1>Account</h1>
        <div className="banner">
          Cloud sync is not configured in this build, so Vega runs fully on this device. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> to enable accounts.
        </div>
      </div>
    )
  }
  if (!ready) return <div className="page-pad muted">Loading…</div>

  if (user) {
    return (
      <div className="page-pad narrow">
        <h1>Account</h1>
        <div className="panel">
          <div className="row-title">{user.user_metadata?.display_name ?? user.email}</div>
          <div className="row-sub">{user.email}</div>
        </div>
        <div className="panel">
          <h3>Sync</h3>
          <div className="muted">
            {sync === 'syncing' && 'Syncing…'}
            {sync === 'synced' && `Up to date · ${ago(lastSync)}`}
            {sync === 'idle' && 'Waiting for the first sync'}
            {sync === 'error' && <span className="err">Sync failed: {syncError}</span>}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            {likes} liked songs · {playlists} playlists · {plays} plays on this device
          </div>
          <div className="actions">
            <button className="pill" disabled={sync === 'syncing'} onClick={() => void syncNow()}>
              Sync now
            </button>
            <button className="pill ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
          <p className="muted small">
            Likes, playlists and listening history follow you across devices. Local music files stay on their device; only their titles sync.
          </p>
        </div>
      </div>
    )
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'signin') await signIn(email, password)
      else if (mode === 'signup') {
        const { needsConfirm } = await signUp(email, password, name.trim() || undefined)
        if (needsConfirm) setMsg({ kind: 'ok', text: 'Check your email and click the confirmation link, then sign in.' })
      } else {
        await resetPassword(email)
        setMsg({ kind: 'ok', text: 'If that address has an account, a reset link is on its way.' })
      }
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-pad narrow">
      <h1>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h1>
      <p className="muted">Optional. Sign in to sync your likes, playlists and listening history across devices.</p>
      <form className="panel form" onSubmit={(e) => void submit(e)}>
        {mode === 'signup' && (
          <label>
            Display name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={60} />
          </label>
        )}
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== 'reset' && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
        )}
        {msg && <div className={msg.kind === 'err' ? 'err' : 'ok'}>{msg.text}</div>}
        <button className="pill big" disabled={busy} type="submit">
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
        <div className="form-links">
          {mode !== 'signin' && (
            <button type="button" className="link" onClick={() => setMode('signin')}>
              Have an account? Sign in
            </button>
          )}
          {mode !== 'signup' && (
            <button type="button" className="link" onClick={() => setMode('signup')}>
              Create account
            </button>
          )}
          {mode === 'signin' && (
            <button type="button" className="link" onClick={() => setMode('reset')}>
              Forgot password?
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
