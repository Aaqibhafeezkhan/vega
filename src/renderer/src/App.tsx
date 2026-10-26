import { useEffect } from 'react'
import { useCatalog } from './store/catalog'
import { useLibrary } from './store/library'
import { useMeta } from './store/meta'
import './store/auth' // starts session restore and background sync
import { PlayerBar } from './components/PlayerBar'
import { QueuePanel } from './components/QueuePanel'
import { Sidebar } from './components/Sidebar'
import { usePlayer } from './store/player'
import { useUi } from './store/ui'
import { Home } from './views/Home'
import { Library } from './views/Library'
import { PlaylistView } from './views/PlaylistView'
import { Search } from './views/Search'
import { Account } from './views/Account'
import { NowPlaying } from './views/NowPlaying'
import { SmartView } from './views/SmartView'
import { Sources } from './views/Sources'
import { Stats } from './views/Stats'

export function App() {
  const view = useUi((s) => s.view)
  const panel = useUi((s) => s.panel)
  const nowPlaying = useUi((s) => s.nowPlaying)

  useEffect(() => {
    void useCatalog.getState().refresh()
  }, [])

  // Background enrichment: learn genres for artists we know nothing about (1 request/s, cached).
  const catalog = useCatalog((s) => s.tracks)
  const events = useLibrary((s) => s.events)
  const liked = useLibrary((s) => s.liked)
  useEffect(() => {
    const t = setTimeout(() => useMeta.getState().request([...liked, ...events.slice(-200).map((e) => e.track), ...catalog.slice(0, 300)]), 1500)
    return () => clearTimeout(t)
  }, [catalog, events, liked])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text') return
      if (e.code === 'Space') {
        e.preventDefault()
        usePlayer.getState().togglePlay()
      } else if (e.code === 'ArrowRight' && e.ctrlKey) usePlayer.getState().next()
      else if (e.code === 'ArrowLeft' && e.ctrlKey) usePlayer.getState().prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app${panel ? ' with-queue' : ''}`}>
      <Sidebar />
      <main className="main">
        {view.name === 'home' && <Home />}
        {view.name === 'search' && <Search />}
        {view.name === 'library' && <Library />}
        {view.name === 'stats' && <Stats />}
        {view.name === 'sources' && <Sources />}
        {view.name === 'account' && <Account />}
        {view.name === 'playlist' && <PlaylistView id={view.id} />}
        {view.name === 'smart' && <SmartView id={view.id} key={view.id} />}
      </main>
      {panel && <QueuePanel />}
      <PlayerBar />
      {nowPlaying && <NowPlaying />}
    </div>
  )
}
