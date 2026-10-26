import type { Track } from '@shared/types'
import { usePlayer } from '@/store/player'
import { TrackRow } from './TrackRow'

export function TrackList({
  tracks,
  numbered = true,
  extra
}: {
  tracks: Track[]
  numbered?: boolean
  extra?: (index: number) => { label: string; run: () => void }[]
}) {
  const playTracks = usePlayer((s) => s.playTracks)
  return (
    <div className="tracklist">
      {tracks.map((t, i) => (
        <TrackRow key={`${t.ref.source}:${t.ref.id}:${i}`} track={t} index={numbered ? i : undefined} onPlay={() => playTracks(tracks, i)} extra={extra?.(i)} />
      ))}
    </div>
  )
}
