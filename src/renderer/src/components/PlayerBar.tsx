import { refKey } from '@shared/types'
import { fmtTime } from '@/lib/format'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

export function PlayerBar() {
  const p = usePlayer()
  const track = p.queue[p.index]
  const liked = useLibrary((s) => !!track && s.liked.some((x) => refKey(x.ref) === refKey(track.ref)))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const queueOpen = useUi((s) => s.queueOpen)
  const toggleQueue = useUi((s) => s.toggleQueue)
  const pct = p.durationMs ? (p.positionMs / p.durationMs) * 100 : 0

  return (
    <footer className="playerbar">
      <div className="pb-left">
        {track ? (
          <>
            <Cover track={track} size={56} radius={8} />
            <div className="pb-meta">
              <div className="row-title">{track.title}</div>
              <div className="row-sub">{p.error ?? track.artists.join(', ')}</div>
            </div>
            <button className={`icon-btn like${liked ? ' on' : ''}`} onClick={() => toggleLike(track)} aria-label="Like">
              <Icon name={liked ? 'heart-fill' : 'heart'} size={18} />
            </button>
          </>
        ) : (
          <div className="muted">Nothing playing</div>
        )}
      </div>

      <div className="pb-center">
        <div className="pb-controls">
          <button className={`icon-btn${p.shuffle ? ' on' : ''}`} onClick={p.toggleShuffle} aria-label="Shuffle">
            <Icon name="shuffle" size={18} />
          </button>
          <button className="icon-btn" onClick={p.prev} aria-label="Previous">
            <Icon name="prev" size={22} />
          </button>
          <button className="play-btn" onClick={p.togglePlay} aria-label={p.playing ? 'Pause' : 'Play'} disabled={!track}>
            <Icon name={p.playing ? 'pause' : 'play'} size={22} />
          </button>
          <button className="icon-btn" onClick={() => p.next()} aria-label="Next">
            <Icon name="next" size={22} />
          </button>
          <button className={`icon-btn${p.repeat !== 'off' ? ' on' : ''}`} onClick={p.cycleRepeat} aria-label={`Repeat ${p.repeat}`}>
            <Icon name={p.repeat === 'one' ? 'repeat-one' : 'repeat'} size={18} />
          </button>
        </div>
        <div className="pb-seek">
          <span className="time">{fmtTime(p.positionMs)}</span>
          <input
            type="range"
            className="slider"
            min={0}
            max={Math.max(1, p.durationMs)}
            value={p.positionMs}
            disabled={!track}
            style={{ ['--pct' as string]: `${pct}%` }}
            onChange={(e) => p.seek(Number(e.target.value))}
            aria-label="Seek"
          />
          <span className="time">{fmtTime(p.durationMs)}</span>
        </div>
      </div>

      <div className="pb-right">
        <button className={`icon-btn${queueOpen ? ' on' : ''}`} onClick={toggleQueue} aria-label="Queue">
          <Icon name="queue" size={20} />
        </button>
        <Icon name="volume" size={18} />
        <input
          type="range"
          className="slider vol"
          min={0}
          max={1}
          step={0.01}
          value={p.volume}
          style={{ ['--pct' as string]: `${p.volume * 100}%` }}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </footer>
  )
}
