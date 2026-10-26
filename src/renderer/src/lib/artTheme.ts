import { useEffect } from 'react'
import { extractPalette, NEUTRAL_PALETTE, paletteFromKey } from './palette'
import { usePlayer } from '@/store/player'

/** Colours the whole app from the playing track's artwork (falls back to the generated cover's hue). */
export function useArtTheme(): void {
  const track = usePlayer((s) => s.queue[s.index] ?? null)
  const url = track?.artworkUrl
  const key = track ? `${track.album ?? ''}${track.artists[0] ?? ''}` : ''

  useEffect(() => {
    let live = true
    const apply = (p: { accent: string; tint1: string; tint2: string }): void => {
      const r = document.documentElement.style
      r.setProperty('--accent', p.accent)
      r.setProperty('--tint1', p.tint1)
      r.setProperty('--tint2', p.tint2)
    }
    if (!track) {
      apply(NEUTRAL_PALETTE)
      return
    }
    const fallback = paletteFromKey(key)
    apply(fallback)
    if (url) void extractPalette(url, fallback).then((p) => live && apply(p))
    return () => {
      live = false
    }
  }, [track, url, key])
}
