import { useIdle } from '@/hooks/useIdle'
import { usePlayerView } from '@/hooks/usePlayerView'
import { joinArtists } from '@/lib/format'
import { useBgState } from '@/store/bgState'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { requestMode, useUi } from '@/store/ui'
import { Artwork } from './Artwork'
import { IconButton, Transport, VolumeControl } from './Controls'
import { LyricsView } from './LyricsView'
import { LikeButton } from './MiniPlayer'
import { ProgressBar } from './ProgressBar'
import { ConnectScreen, LoadingScreen, NoMusicScreen, OfflineBanner, OfflineScreen } from './StateScreens'

export function FullscreenPlayer() {
  const view = usePlayerView()
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const device = usePlayer((s) => s.snapshot?.device ?? null)
  const idle = useIdle(3500)
  const panel = useUi((s) => s.panel)
  const togglePanel = useUi((s) => s.togglePanel)
  const df = useUi((s) => s.distractionFree)
  const toggleDf = useUi((s) => s.toggleDistractionFree)

  const quiet = idle && panel === 'none'
  // Design D layout: video (or the artwork backdrop when there is none) behind big lyrics, with a floating dock
  const hasVideo = useBgState((s) => s.media === 'full')
  const cinema = hasVideo || document.documentElement.dataset.platform !== 'android'
  const layout = useSettings((s) => s.settings.fullLayout)

  return (
    <div className={`full ${quiet ? 'is-idle' : ''} ${df ? 'is-df' : ''} ${cinema ? `is-cinema layout-${layout}` : ''}`}>
      <header className="full__top">
        <span className="full__device">{device ? `Playing on ${device.name}` : 'Vega'}</span>
        {cinema ? (
          <div className="cine-pills">
            <button className={df ? 'on' : ''} onClick={toggleDf} title="Distraction-free: video and lyrics only">
              Aa
            </button>
            <button className={panel === 'settings' ? 'on' : ''} onClick={() => togglePanel('settings')}>
              Settings
            </button>
            <button onClick={() => requestMode('mini')} title="Exit fullscreen (Esc)">
              Collapse
            </button>
          </div>
        ) : (
          <div className="full__tools">
            <IconButton icon="type" label="Distraction-free: artwork and lyrics only" active={df} onClick={toggleDf} />
            <IconButton icon="settings" label="Settings" active={panel === 'settings'} onClick={() => togglePanel('settings')} />
            <IconButton icon="exitFullscreen" label="Exit fullscreen (Esc)" onClick={() => requestMode('mini')} />
          </div>
        )}
      </header>

      {view === 'playing' && track ? (
        <div className="full__body">
          {cinema ? (
            <>
              <div className="cine-dock">
                <div className="cine-l">
                  <Artwork url={track.artworkUrl} size={48} radius={24} />
                  <div>
                    <b title={track.title}>{track.title}</b>
                    <span>{joinArtists(track.artists)}</span>
                  </div>
                </div>
                <div className="cine-c">
                  <Transport size="lg" extras />
                  <ProgressBar showTimes />
                </div>
                <div className="cine-r">
                  <LikeButton size={20} />
                  <VolumeControl />
                </div>
              </div>
            </>
          ) : (
          <aside className="full__side">
              <Artwork url={track.artworkUrl} size={cinema ? 'clamp(84px, 12vh, 124px)' : 'min(34vw, 46vh, 460px)'} radius={cinema ? 14 : 18} className="artwork--lift" />
              <div className="full__chrome">
                <div className="full__titlerow">
                  <div className="full__titles">
                    <h1 title={track.title}>{track.title}</h1>
                    <p className="full__artist">{joinArtists(track.artists)}</p>
                    <p className="full__album">
                      {track.album}
                      {track.releaseYear ? ` · ${track.releaseYear}` : ''}
                    </p>
                  </div>
                  <LikeButton size={22} />
                </div>
                <ProgressBar showTimes remaining />
                <div className="full__controls">
                  <Transport size="lg" extras />
                </div>
                <div className="full__volume">
                  <VolumeControl wide />
                  <IconButton icon="external" label="Open in Spotify" size={16} onClick={() => void window.lyra.player.openInSpotify(track)} />
                </div>
              </div>
            </aside>
          )}
          <section className="full__lyrics">
            <LyricsView variant="full" />
          </section>
          <OfflineBanner />
        </div>
      ) : (
        <div className="full__screen">
          {view === 'loading' && <LoadingScreen />}
          {view === 'connect' && <ConnectScreen />}
          {view === 'offline' && <OfflineScreen />}
          {(view === 'idle' || view === 'ad') && <NoMusicScreen ad={view === 'ad'} />}
        </div>
      )}
    </div>
  )
}
