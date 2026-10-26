import { useState } from 'react'
import { Icon } from '@/components/Icon'
import { TrackList } from '@/components/TrackList'
import { fmtMinutes } from '@/lib/format'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'

export function PlaylistView({ id }: { id: string }) {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id))
  const { renamePlaylist, deletePlaylist, removeFromPlaylist, moveInPlaylist } = useLibrary.getState()
  const playTracks = usePlayer((s) => s.playTracks)
  const go = useUi((s) => s.go)
  const [editing, setEditing] = useState(false)
  if (!playlist) return <div className="page-pad muted">Playlist not found.</div>
  const mins = Math.round(playlist.tracks.reduce((n, t) => n + t.durationMs, 0) / 60_000)

  return (
    <div className="page-pad">
      <div className="hero-head">
        <div className="hero-art">
          <Icon name="library" size={56} />
        </div>
        <div>
          <div className="eyebrow">Playlist</div>
          {editing ? (
            <input
              className="title-input"
              autoFocus
              defaultValue={playlist.name}
              onBlur={(e) => {
                renamePlaylist(id, e.target.value)
                setEditing(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <h1 onDoubleClick={() => setEditing(true)} title="Double-click to rename">
              {playlist.name}
            </h1>
          )}
          <div className="muted">
            {playlist.tracks.length} songs · {fmtMinutes(mins)}
          </div>
          <div className="actions">
            <button className="pill big" disabled={!playlist.tracks.length} onClick={() => playTracks(playlist.tracks)}>
              <Icon name="play" size={16} /> Play
            </button>
            <button
              className="pill ghost"
              onClick={() => {
                deletePlaylist(id)
                go({ name: 'home' })
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      {!playlist.tracks.length && <div className="muted pad">Empty. Use the ⋯ menu on any song to add it here.</div>}
      <TrackList
        tracks={playlist.tracks}
        extra={(i) => [
          { label: 'Move up', run: () => moveInPlaylist(id, i, i - 1) },
          { label: 'Move down', run: () => moveInPlaylist(id, i, i + 1) },
          { label: 'Remove from playlist', run: () => removeFromPlaylist(id, i) }
        ]}
      />
    </div>
  )
}
