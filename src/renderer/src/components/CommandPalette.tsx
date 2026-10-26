import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { radioFrom } from '@/lib/recommender'
import { sources } from '@/lib/sources'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

interface Item {
  id: string
  label: string
  hint?: string
  icon: string
  run: () => void
  track?: Track
}

/** Ctrl/Cmd+K: jump anywhere, run an action, or find and play a song without leaving the page. */
export function CommandPalette() {
  const close = () => useUi.getState().setCommandOpen(false)
  const go = useUi((s) => s.go)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [songs, setSongs] = useState<Track[]>([])
  const list = useRef<HTMLDivElement>(null)

  const actions: Item[] = useMemo(() => {
    const p = usePlayer.getState()
    const lib = useLibrary.getState()
    const items: Item[] = [
      { id: 'go-home', label: 'Go to Home', icon: 'home', run: () => go({ name: 'home' }) },
      { id: 'go-search', label: 'Go to Search', icon: 'search', run: () => go({ name: 'search' }) },
      { id: 'go-library', label: 'Go to Library', icon: 'library', run: () => go({ name: 'library' }) },
      { id: 'go-radio', label: 'Go to Radio', icon: 'radio', run: () => go({ name: 'radio' }) },
      { id: 'go-stats', label: 'Go to Insights', icon: 'stats', run: () => go({ name: 'stats' }) },
      { id: 'go-sources', label: 'Go to Sources', icon: 'folder', run: () => go({ name: 'sources' }) },
      { id: 'go-account', label: 'Account and sync', icon: 'user', run: () => go({ name: 'account' }) },
      { id: 'new-smart', label: 'New smart playlist', icon: 'spark', run: () => go({ name: 'smart', id: 'new' }) },
      { id: 'toggle', label: p.playing ? 'Pause' : 'Play', hint: 'Space', icon: p.playing ? 'pause' : 'play', run: () => p.togglePlay() },
      { id: 'next', label: 'Next track', icon: 'next', run: () => p.next() },
      { id: 'shuffle', label: `Shuffle ${p.shuffle ? 'off' : 'on'}`, icon: 'shuffle', run: () => p.toggleShuffle() }
    ]
    const cur = p.queue[p.index]
    if (cur) {
      items.push({
        id: 'radio',
        label: `Start radio from “${cur.title}”`,
        icon: 'radio',
        run: () => void radioFrom(cur).then((t) => usePlayer.getState().playTracks(t))
      })
      items.push({ id: 'lyra', label: 'Open the Lyra player', icon: 'lyrics', run: () => useUi.getState().openNowPlaying() })
    }
    if (!lib.events.length) items.push({ id: 'demo', label: 'Load demo listening history', icon: 'clock', run: () => lib.seedDemoHistory() })
    return items
  }, [go])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setSongs([])
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      sources.search(term, { limit: 6, signal: ctl.signal, timeoutMs: 3500 }).then((r) => !ctl.signal.aborted && setSongs(r.slice(0, 6))).catch(() => {})
    }, 180)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q])

  const items: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase()
    const acts = term ? actions.filter((a) => a.label.toLowerCase().includes(term)) : actions.slice(0, 8)
    const tracks: Item[] = songs.map((t) => ({
      id: `t-${t.ref.source}-${t.ref.id}`,
      label: t.title,
      hint: t.artists.join(', '),
      icon: 'play',
      track: t,
      run: () => usePlayer.getState().playTracks([t])
    }))
    return [...tracks, ...acts]
  }, [q, actions, songs])

  useEffect(() => {
    setActive(0)
  }, [q, songs])
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (it: Item | undefined): void => {
    if (!it) return
    close()
    it.run()
  }

  return (
    <div className="cmd-scrim" onMouseDown={close}>
      <div
        className="cmd"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(items.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') run(items[active])
        }}
      >
        <div className="cmd-input">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs or type a command…" aria-label="Command palette search" />
          <kbd>esc</kbd>
        </div>
        <div className="cmd-list" ref={list}>
          {items.map((it, i) => (
            <button key={it.id} className="cmd-item" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(it)}>
              {it.track ? <Cover track={it.track} size={34} radius={8} /> : <span className="cmd-icon"><Icon name={it.icon} size={16} /></span>}
              <span className="cmd-label">{it.label}</span>
              {it.hint && <span className="cmd-hint">{it.hint}</span>}
            </button>
          ))}
          {!items.length && <div className="muted pad">No matches.</div>}
        </div>
      </div>
    </div>
  )
}
