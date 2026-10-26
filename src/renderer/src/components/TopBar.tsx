import { useEffect, useRef } from 'react'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { Icon } from './Icon'

export function TopBar() {
  const { back, forward, cursor, history, go, query, setQuery, view, setCommandOpen } = useUi()
  const auth = useAuth()
  const input = useRef<HTMLInputElement>(null)

  // "/" focuses search from anywhere (Ctrl/Cmd+K opens the command palette instead)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-nav">
        <button className="icon-btn" onClick={back} disabled={cursor === 0} aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </button>
        <button className="icon-btn" onClick={forward} disabled={cursor >= history.length - 1} aria-label="Forward">
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      <label className="topsearch">
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={query}
          placeholder="What do you want to hear?"
          onFocus={() => view.name !== 'search' && go({ name: 'search' })}
          onChange={(e) => {
            setQuery(e.target.value)
            if (view.name !== 'search') go({ name: 'search' })
          }}
          aria-label="Search"
        />
        {query ? (
          <button type="button" className="icon-btn sm" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="close" size={14} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </label>

      <div className="topbar-end">
        <button className="chip cmd-chip" onClick={() => setCommandOpen(true)} title="Command palette (Ctrl+K)">
          <Icon name="command" size={14} /> K
        </button>
        <button className="avatar-btn" onClick={() => go({ name: 'account' })} aria-label="Account">
          <span className={`avatar sync-${auth.user ? auth.sync : 'off'}`}>{auth.user?.email?.charAt(0).toUpperCase() ?? <Icon name="user" size={16} />}</span>
        </button>
      </div>
    </header>
  )
}
