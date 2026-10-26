import { useIdle } from '@/hooks/useIdle'
import { usePlayerView } from '@/hooks/usePlayerView'
import { joinArtists } from '@/lib/format'
import { useBgState } from '@/store/bgState'
import { usePlayer } from '@/store/player'
import { requestMode, useUi } from '@/store/ui'
import { Artwork } from './Artwork'
import { IconButton, Transport, VolumeControl } from './Controls'
import { LyricsView } from './LyricsView'
import { ProgressBar } from './ProgressBar'
import { LoadingScreen, NoMusicScreen } from './StateScreens'

export function LikeButton({ size = 18 }: { size?: number }) {
  const liked = usePlayer((s) => s.liked)
  const toggle = usePlayer((s) => s.toggleLike)
  const unavailable = liked === null
  return (
    <IconButton
      icon="heart"
      label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
      active={!!liked}
      filled={!!liked}
      disabled={unavailable}
      size={size}
      className="likebtn"
      onClick={() => void toggle()}
    />
  )
}

/** The expanded player shown in Vega's side panel: artwork, controls and synced lyrics. */
export function MiniPlayer() {
  const view = usePlayerView()
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const panel = useUi((s) => s.panel)
  const togglePanel = useUi((s) => s.togglePanel)
  const videoBehind = useBgState((x) => x.media === 'mini')
  // with a video behind it, the header / title / controls fade away after a few seconds and return on touch
  const idle = useIdle(6000)

  return (
    <div className={`mini ${videoBehind && idle && panel === 'none' ? 'is-idle' : ''}`}>
      <header className="mini__head">
        <span className="mini__device">Vega</span>
        <div className="mini__tools" data-nodrag>
          <IconButton icon="settings" label="Lyrics settings" active={panel === 'settings'} size={16} onClick={() => togglePanel('settings')} />
          <IconButton icon="fullscreen" label="Fullscreen" size={16} onClick={() => requestMode('full')} />
          <IconButton icon="close" label="Close lyrics" size={16} onClick={() => window.lyra.window.quit()} />
        </div>
      </header>

      {view === 'playing' && track ? (
        <>
          {!videoBehind && (
            <div className="mini__art">
              <Artwork url={track.artworkUrl} size="min(232px, 31vh)" radius={14} className="artwork--lift" />
            </div>
          )}
          <div className="mini__card">
            <div className="mini__info">
              {videoBehind && <Artwork url={track.artworkUrl} size="58px" radius={11} className="artwork--lift" />}
              <div className="mini__text">
                <h1 title={track.title}>{track.title}</h1>
                <p title={joinArtists(track.artists)}>{joinArtists(track.artists)}</p>
              </div>
              <div className="mini__info-actions" data-nodrag>
                <LikeButton />
              </div>
            </div>
            <div className="mini__progress" data-nodrag>
              <ProgressBar showTimes />
            </div>
            <div className="mini__transport" data-nodrag>
              <Transport size="md" extras />
            </div>
            <div className="mini__volume" data-nodrag>
              <VolumeControl wide />
            </div>
          </div>
          <div className="mini__lyrics">
            <LyricsView variant="mini" />
          </div>
        </>
      ) : (
        <div className="mini__screen">{view === 'loading' ? <LoadingScreen /> : <NoMusicScreen ad={false} />}</div>
      )}
    </div>
  )
}
