import { useEffect, useState } from 'react'
import { refKey } from '@shared/types'
import { Cover } from '@/components/Cover'
import { Icon } from '@/components/Icon'
import { LyricsView } from '@/components/LyricsView'
import { fmtTime } from '@/lib/format'
import { extractPalette, NEUTRAL_PALETTE, paletteFromKey, type Palette } from '@/lib/palette'
import { useLibrary } from '@/store/library'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'

function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const wake = (): void => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), ms)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [ms])
  return idle
}

/** Colours from the cover art (or, without art, the placeholder cover's hue). */
function usePalette(url: string | undefined, key: string): Palette {
  const [pal, setPal] = useState<Palette>(NEUTRAL_PALETTE)
  useEffect(() => {
    let live = true
    const fallback = paletteFromKey(key)
    setPal(fallback)
    if (url) void extractPalette(url, fallback).then((p) => live && setPal(p))
    return () => {
      live = false
    }
  }, [url, key])
  return pal
}

export function NowPlaying() {
  const close = useUi((s) => s.closeNowPlaying)
  const karaoke = useUi((s) => s.karaoke)
  const setKaraoke = useUi((s) => s.setKaraoke)
  const p = usePlayer()
  const track = p.queue[p.index] ?? null
  const liked = useLibrary((s) => !!track && s.liked.some((x) => refKey(x.ref) === refKey(track.ref)))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const wordByWord = useLyrics((s) => s.wordByWord)
  const setWordByWord = useLyrics((s) => s.setWordByWord)
  const romanize = useLyrics((s) => s.romanize)
  const setRomanize = useLyrics((s) => s.setRomanize)
  const idle = useIdle(3500)
  const pal = usePalette(track?.artworkUrl, track ? `${track.album ?? ''}${track.artists[0] ?? ''}` : '')
  const pct = p.durationMs ? (p.positionMs / p.durationMs) * 100 : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      else if (e.key.toLowerCase() === 'k' && !(e.target instanceof HTMLInputElement)) setKaraoke(!useUi.getState().karaoke)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, setKaraoke])

  const style = { ['--tint1' as string]: pal.tint1, ['--tint2' as string]: pal.tint2, ['--accent-art' as string]: pal.accent }

  return (
    <div className={`np${karaoke ? ' is-karaoke' : ''}${idle ? ' is-idle' : ''}`} style={style} role="dialog" aria-label="Now playing">
      <div className="np__bg" aria-hidden />
      <header className="np__top">
        <button className="icon-btn" onClick={close} aria-label="Close now playing">
          <Icon name="close" size={20} />
        </button>
        <div className="np__tools">
          <button className={`chip${karaoke ? ' on' : ''}`} onClick={() => setKaraoke(!karaoke)} title="Karaoke mode (K)">
            Karaoke
          </button>
          <button className={`chip${wordByWord ? ' on' : ''}`} onClick={() => setWordByWord(!wordByWord)} title="Estimate word-by-word timing">
            Word by word
          </button>
          <button className={`chip${romanize ? ' on' : ''}`} onClick={() => setRomanize(!romanize)} title="Romanize Hindi and Punjabi lyrics">
            Romanize
          </button>
        </div>
      </header>

      {track ? (
        <div className="np__body">
          {!karaoke && (
            <aside className="np__side">
              <Cover track={track} size={360} radius={18} />
              <div className="np__titles">
                <div>
                  <h1 title={track.title}>{track.title}</h1>
                  <p>{track.artists.join(', ')}</p>
                  {track.album && <p className="np__album">{track.album}</p>}
                </div>
                <button className={`icon-btn like${liked ? ' on' : ''}`} onClick={() => toggleLike(track)} aria-label="Like">
                  <Icon name={liked ? 'heart-fill' : 'heart'} size={22} />
                </button>
              </div>
            </aside>
          )}
          <section className="np__lyrics">
            {karaoke && (
              <div className="np__kmeta">
                <strong>{track.title}</strong> · {track.artists.join(', ')}
              </div>
            )}
            <LyricsView track={track} variant={karaoke ? 'karaoke' : 'full'} />
          </section>
        </div>
      ) : (
        <div className="np__empty muted">Nothing playing</div>
      )}

      <footer className="np__controls">
        <div className="np__seek">
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
        <div className="pb-controls">
          <button className={`icon-btn${p.shuffle ? ' on' : ''}`} onClick={p.toggleShuffle} aria-label="Shuffle">
            <Icon name="shuffle" size={20} />
          </button>
          <button className="icon-btn" onClick={p.prev} aria-label="Previous">
            <Icon name="prev" size={26} />
          </button>
          <button className="play-btn big" onClick={p.togglePlay} aria-label={p.playing ? 'Pause' : 'Play'} disabled={!track}>
            <Icon name={p.playing ? 'pause' : 'play'} size={28} />
          </button>
          <button className="icon-btn" onClick={() => p.next()} aria-label="Next">
            <Icon name="next" size={26} />
          </button>
          <button className={`icon-btn${p.repeat !== 'off' ? ' on' : ''}`} onClick={p.cycleRepeat} aria-label={`Repeat ${p.repeat}`}>
            <Icon name={p.repeat === 'one' ? 'repeat-one' : 'repeat'} size={20} />
          </button>
        </div>
      </footer>
    </div>
  )
}
