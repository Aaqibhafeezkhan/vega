import { useEffect, useRef } from 'react'
import '@/lib/lyraHost'
import { useUi } from '@/store/ui'

/**
 * Lyra's real player UI (backdrop, video backgrounds, synced and word-by-word lyrics, karaoke), shown full screen.
 * It is Lyra's own page (built from /lyra) in a same-origin iframe, so its styles and behaviour stay exactly as in Lyra.
 */
export function LyraPlayer() {
  const frame = useRef<HTMLIFrameElement>(null)
  const close = useUi((s) => s.closeNowPlaying)

  useEffect(() => {
    frame.current?.focus()
    // Esc inside the iframe is handled by Lyra (it asks Vega to close); this covers focus being outside it
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div className="lyra-overlay" role="dialog" aria-label="Lyra player">
      <iframe ref={frame} className="lyra-frame" src="lyra/index.html" title="Lyra" allow="autoplay; fullscreen; microphone" />
    </div>
  )
}
