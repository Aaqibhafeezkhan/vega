/**
 * Android app shell (android/): the WebView exposes `window.vegaAndroid` (a WebMessageListener limited to Vega's own origin).
 * We push the now-playing state to the native media session (notification + lock screen controls, foreground service that
 * keeps audio alive with the screen off) and expose `window.__vegaAndroid` for commands coming back.
 * A no-op in the browser and on desktop.
 */
import { refKey } from '@shared/types'
import { useUi } from '@/store/ui'
import { getPosition, usePlayer } from '@/store/player'

interface NativePort {
  postMessage(msg: string): void
}
declare global {
  interface Window {
    vegaAndroid?: NativePort
    __vegaAndroid?: { command(cmd: string, arg?: number): void; back(): boolean }
  }
}

export type NativeCommand = 'play' | 'pause' | 'next' | 'prev' | 'seek'

export function runCommand(cmd: NativeCommand | string, arg?: number): void {
  const p = usePlayer.getState()
  if (cmd === 'play') {
    if (!p.playing) p.togglePlay()
  } else if (cmd === 'pause') {
    if (p.playing) p.togglePlay()
  } else if (cmd === 'next') p.next()
  else if (cmd === 'prev') p.prev()
  else if (cmd === 'seek' && typeof arg === 'number') p.seek(arg)
}

/** Hardware back: close the topmost overlay or go back a page. Returns false when there is nothing left (the app then goes to the background). */
export function handleBack(): boolean {
  const ui = useUi.getState()
  if (ui.commandOpen) return ui.setCommandOpen(false), true
  if (ui.eqOpen) return ui.setEqOpen(false), true
  if (ui.nowPlaying) return ui.closeNowPlaying(), true
  if (ui.panel) return ui.closePanel(), true
  if (ui.cursor > 0) return ui.back(), true
  return false
}

export function initAndroidBridge(): void {
  const native = window.vegaAndroid
  if (!native) return
  window.__vegaAndroid = { command: runCommand, back: handleBack }

  let lastKey = ''
  const push = (force = false): void => {
    const p = usePlayer.getState()
    const t = p.current()
    const key = JSON.stringify([t ? refKey(t.ref) : '', p.playing, Math.round(p.durationMs / 1000)])
    if (!force && key === lastKey) return
    lastKey = key
    native.postMessage(
      JSON.stringify({
        type: 'state',
        has: !!t,
        playing: p.playing,
        title: t?.title ?? '',
        artist: t?.artists.join(', ') ?? '',
        album: t?.album ?? '',
        art: t?.artworkUrl ?? '',
        durationMs: Math.round(p.durationMs),
        positionMs: Math.round(getPosition())
      })
    )
  }
  usePlayer.subscribe(() => push())
  // resync the lock-screen progress bar after seeks and drift
  setInterval(() => usePlayer.getState().playing && push(true), 8000)
  push(true)
}
