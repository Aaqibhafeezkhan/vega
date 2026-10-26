import { LyricsView } from './LyricsView'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

export function QueuePanel() {
  const panel = useUi((s) => s.panel)
  const togglePanel = useUi((s) => s.togglePanel)
  const closePanel = useUi((s) => s.closePanel)
  const { queue, index, playIndex, removeFromQueue, clearQueue } = usePlayer()
  const track = queue[index] ?? null

  return (
    <aside className="queue">
      <div className="queue-head">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={panel === 'queue'} className={panel === 'queue' ? 'on' : ''} onClick={() => panel !== 'queue' && togglePanel('queue')}>
            Queue
          </button>
          <button role="tab" aria-selected={panel === 'lyrics'} className={panel === 'lyrics' ? 'on' : ''} onClick={() => panel !== 'lyrics' && togglePanel('lyrics')}>
            Lyrics
          </button>
        </div>
        {panel === 'queue' && (
          <button className="link" onClick={clearQueue}>
            Clear
          </button>
        )}
        <button className="icon-btn" onClick={closePanel} aria-label="Close panel">
          <Icon name="close" size={18} />
        </button>
      </div>

      {panel === 'lyrics' && (
        <div className="queue-lyrics">
          <LyricsView track={track} variant="panel" />
        </div>
      )}

      {panel === 'queue' && (
        <>
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
        </>
      )}
    </aside>
  )
}
