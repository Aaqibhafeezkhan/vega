import type { PlaybackSnapshot, PlayerCommand, QueueItem } from '../shared/types'

/**
 * What Vega (the parent page) offers to Lyra's player UI, which runs in a same-origin iframe.
 * Vega sets `window.__vegaHost`; Lyra's bridge (host/api.ts) turns it into the `window.lyra` API the UI expects.
 */
export interface VegaHost {
  /** Current playback in Lyra's snapshot shape (null when nothing is loaded). */
  snapshot(): PlaybackSnapshot | null
  /** Called whenever the track, play state, shuffle/repeat or volume changes (not for every position tick). */
  subscribe(cb: (s: PlaybackSnapshot | null) => void): () => void
  command(cmd: PlayerCommand): boolean
  isLiked(trackId: string): boolean
  setLiked(trackId: string, liked: boolean): boolean
  queue(): QueueItem[]
  /** Lyra asked to leave the player (Esc / exit fullscreen). */
  close(): void
  /** Lyra can ask the host to run a desktop-only helper (e.g. proxy an Apple preview clip). */
  clipUrl(url: string): string
}

declare global {
  interface Window {
    __vegaHost?: VegaHost
    lyra: import('../shared/ipc').LyraApi
  }
}
