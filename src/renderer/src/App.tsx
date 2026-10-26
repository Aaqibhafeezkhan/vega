import { useEffect } from 'react'
import { useCatalog } from './store/catalog'
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
import { Sources } from './views/Sources'
import { Stats } from './views/Stats'

export function App() {
  const view = useUi((s) => s.view)
  const queueOpen = useUi((s) => s.queueOpen)

  useEffect(() => {
    void useCatalog.getState().refresh()
  }, [])

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
    <div className={`app${queueOpen ? ' with-queue' : ''}`}>
      <Sidebar />
      <main className="main">
        {view.name === 'home' && <Home />}
        {view.name === 'search' && <Search />}
        {view.name === 'library' && <Library />}
        {view.name === 'stats' && <Stats />}
        {view.name === 'sources' && <Sources />}
        {view.name === 'account' && <Account />}
        {view.name === 'playlist' && <PlaylistView id={view.id} />}
      </main>
      {queueOpen && <QueuePanel />}
      <PlayerBar />
    </div>
  )
}
