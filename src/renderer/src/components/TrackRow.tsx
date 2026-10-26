import { useState } from 'react'
import { refKey, type Track } from '@shared/types'
import { fmtTime } from '@/lib/format'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { Cover } from './Cover'
import { Icon } from './Icon'

const SOURCE_LABEL: Record<string, string> = { audius: 'Audius', jamendo: 'Jamendo' }

interface Props {
  track: Track
  index?: number
  onPlay: () => void
  /** Extra actions shown in the menu (e.g. "Remove from playlist"). */
  extra?: { label: string; run: () => void }[]
}

export function TrackRow({ track, index, onPlay, extra }: Props) {
  const key = refKey(track.ref)
  const active = usePlayer((s) => {
    const c = s.queue[s.index]
    return !!c && refKey(c.ref) === key
  })
  const playing = usePlayer((s) => s.playing)
  const liked = useLibrary((s) => s.liked.some((x) => refKey(x.ref) === key))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const [menu, setMenu] = useState(false)

  return (
    <div className={`row${active ? ' active' : ''}`} onDoubleClick={onPlay}>
      <button className="row-idx" onClick={onPlay} aria-label={`Play ${track.title}`}>
        {active && playing ? <span className="eq" /> : <span className="num">{index !== undefined ? index + 1 : ''}</span>}
        <span className="hover-play">
          <Icon name="play" size={14} />
        </span>
      </button>
      <Cover track={track} size={40} radius={6} />
      <div className="row-main">
        <div className="row-title">{track.title}</div>
        <div className="row-sub">
          {track.artists.join(', ')}
          {SOURCE_LABEL[track.ref.source] && <span className="src">{SOURCE_LABEL[track.ref.source]}</span>}
        </div>
      </div>
      <div className="row-album">{track.album}</div>
      <button className={`icon-btn like${liked ? ' on' : ''}`} onClick={() => toggleLike(track)} aria-label={liked ? 'Unlike' : 'Like'}>
        <Icon name={liked ? 'heart-fill' : 'heart'} size={16} />
      </button>
      <div className="row-time">{fmtTime(track.durationMs)}</div>
      <div className="row-menu-wrap">
        <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="More">
          <Icon name="more" size={16} />
        </button>
        {menu && <TrackMenu track={track} extra={extra} close={() => setMenu(false)} />}
      </div>
    </div>
  )
}

function TrackMenu({ track, extra, close }: { track: Track; extra?: Props['extra']; close: () => void }) {
  const playlists = useLibrary((s) => s.playlists)
  const addToPlaylist = useLibrary((s) => s.addToPlaylist)
  const createPlaylist = useLibrary((s) => s.createPlaylist)
  const { playNext, enqueue } = usePlayer.getState()
  const item = (label: string, run: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        run()
        close()
      }}
    >
      {label}
    </button>
  )
  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="menu">
        {item('Play next', () => playNext(track))}
        {item('Add to queue', () => enqueue(track))}
        <div className="menu-sep">Add to playlist</div>
        {playlists.map((p) => item(p.name, () => addToPlaylist(p.id, track)))}
        {item('+ New playlist', () => createPlaylist(track.title, [track]))}
        {extra && <div className="menu-sep" />}
        {extra?.map((e) => item(e.label, e.run))}
      </div>
    </>
  )
}
