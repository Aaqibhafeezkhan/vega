import { useState } from 'react'
import { coverGradient } from '@/lib/format'
import type { Track } from '@shared/types'

/** Artwork with a generated fallback (gradient + initial) used when there is no image or it fails to load. */
export function Cover({ track, size = 44, radius = 10, fill = false }: { track: Track; size?: number; radius?: number; fill?: boolean }) {
  const [failed, setFailed] = useState(false)
  // Internet Archive's default thumbnail is a waveform picture (older saved tracks still carry it): use our own cover instead
  const usable = track.artworkUrl && !track.artworkUrl.includes('archive.org/services/img')
  const src = usable && !failed ? track.artworkUrl : null
  const style = {
    width: fill ? '100%' : size,
    height: fill ? undefined : size,
    aspectRatio: fill ? '1 / 1' : undefined,
    borderRadius: radius,
    background: src ? '#15161f' : coverGradient(`${track.album ?? ''}${track.artists[0] ?? ''}`)
  }
  return (
    <div className="cover" style={style} aria-hidden>
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="ph" style={{ fontSize: fill ? 'clamp(28px, 4vw, 56px)' : size * 0.4 }}>
          {(track.album ?? track.title).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
