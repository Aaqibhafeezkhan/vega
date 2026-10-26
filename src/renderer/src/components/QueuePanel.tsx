import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

export function QueuePanel() {
  const { queue, index, playIndex, removeFromQueue, clearQueue } = usePlayer()
  const toggle = useUi((s) => s.toggleQueue)
  return (
    <aside className="queue">
      <div className="queue-head">
        <h3>Queue</h3>
        <button className="link" onClick={clearQueue}>
          Clear
        </button>
        <button className="icon-btn" onClick={toggle} aria-label="Close queue">
          <Icon name="close" size={18} />
        </button>
      </div>
      {!queue.length && <div className="muted pad">Queue is empty. Play something.</div>}
      <div className="queue-list">
        {queue.map((t, i) => (
          <div key={`${t.ref.id}-${i}`} className={`qrow${i === index ? ' active' : ''}${i < index ? ' past' : ''}`}>
            <button className="qmain" onClick={() => playIndex(i)}>
              <Cover track={t} size={36} radius={6} />
              <div className="row-main">
                <div className="row-title">{t.title}</div>
                <div className="row-sub">{t.artists.join(', ')}</div>
              </div>
            </button>
            {i !== index && (
              <button className="icon-btn" onClick={() => removeFromQueue(i)} aria-label="Remove from queue">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
