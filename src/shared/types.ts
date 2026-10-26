/** Stable, provider-agnostic identity of a track. Persisted everywhere (library, playlists, history). */
export interface TrackRef {
  source: string
  id: string
}

export interface Track {
  ref: TrackRef
  title: string
  artists: string[]
  album?: string
  durationMs: number
  genres?: string[]
  year?: number
  isrc?: string
  mbid?: string
  /** Remote artwork. Absent => the UI draws a generated cover from the track key. */
  artworkUrl?: string
}

export const refKey = (r: TrackRef): string => `${r.source}:${r.id}`

export const parseRefKey = (k: string): TrackRef => {
  const i = k.indexOf(':')
  return { source: k.slice(0, i), id: k.slice(i + 1) }
}

export interface Playlist {
  id: string
  name: string
  description?: string
  createdAt: number
  /** Last edit time (ms); drives cloud sync conflict resolution. */
  updatedAt?: number
  tracks: Track[]
}

/** One listening session of a track, appended to the analytics log. */
export interface PlayEvent {
  track: Track
  startedAt: number
  listenedMs: number
  /** Reached the scrobble threshold: 30 s or 50 % of the track. */
  counted: boolean
  skipped: boolean
}
