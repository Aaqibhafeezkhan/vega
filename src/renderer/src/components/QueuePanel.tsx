import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

/** Right drawer: what is playing, and what is next. */
export function QueuePanel() {
  const closePanel = useUi((s) => s.closePanel)
  const openNowPlaying = useUi((s) => s.openNowPlaying)
  const { queue, index, playIndex, removeFromQueue, clearQueue } = usePlayer()
  const current = queue[index]
  const upcoming = queue.slice(index + 1)
  const past = queue.slice(0, Math.max(0, index))

  return (
    <aside className="drawer" aria-label="Queue">
      <div className="drawer-head">
        <h3>Queue</h3>
        <button className="link" onClick={clearQueue} disabled={queue.length < 2}>
          Clear
        </button>
        <button className="icon-btn" onClick={closePanel} aria-label="Close queue">
          <Icon name="close" size={18} />
        </button>
      </div>

      {!queue.length && (
        <div className="empty">
          <Icon name="queue" size={28} />
          <p>Your queue is empty</p>
          <span className="muted small">Play a song or start a radio.</span>
        </div>
      )}

      <div className="drawer-scroll">
        {current && (
          <>
            <div className="eyebrow">Now playing</div>
            <button className="now-card" onClick={openNowPlaying}>
              <Cover track={current} size={64} radius={14} />
              <div className="row-main">
                <div className="row-title">{current.title}</div>
                <div className="row-sub">{current.artists.join(', ')}</div>
              </div>
              <Icon name="expand" size={16} />
            </button>
          </>
        )}

        {upcoming.length > 0 && <div className="eyebrow">Next up · {upcoming.length}</div>}
        {upcoming.map((t, k) => {
          const i = index + 1 + k
          return (
            <div key={`${t.ref.id}-${i}`} className="qrow">
              <button className="qmain" onClick={() => playIndex(i)}>
                <Cover track={t} size={40} radius={9} />
                <div className="row-main">
                  <div className="row-title">{t.title}</div>
                  <div className="row-sub">{t.artists.join(', ')}</div>
                </div>
              </button>
              <button className="icon-btn sm" onClick={() => removeFromQueue(i)} aria-label="Remove from queue">
                <Icon name="close" size={14} />
              </button>
            </div>
          )
        })}

        {past.length > 0 && <div className="eyebrow">Played</div>}
        {past.map((t, i) => (
          <div key={`${t.ref.id}-p${i}`} className="qrow past">
            <button className="qmain" onClick={() => playIndex(i)}>
              <Cover track={t} size={40} radius={9} />
              <div className="row-main">
                <div className="row-title">{t.title}</div>
                <div className="row-sub">{t.artists.join(', ')}</div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
