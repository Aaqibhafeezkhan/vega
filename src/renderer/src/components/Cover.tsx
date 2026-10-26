import { coverGradient } from '@/lib/format'
import { refKey, type Track } from '@shared/types'

export function Cover({ track, size = 44, radius = 8 }: { track: Track; size?: number; radius?: number }) {
  const style = {
    width: size,
    height: size,
    borderRadius: radius,
    background: track.artworkUrl ? `center / cover url(${track.artworkUrl})` : coverGradient(`${track.album ?? ''}${track.artists[0] ?? ''}`)
  }
  return (
    <div className="cover" style={style} aria-hidden data-key={refKey(track.ref)}>
      {!track.artworkUrl && <span style={{ fontSize: size * 0.4 }}>{(track.album ?? track.title).charAt(0)}</span>}
    </div>
  )
}
