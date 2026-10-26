import type { Track } from './types'

export type SearchKind = 'track' | 'artist' | 'album'

export interface SearchResult {
  tracks: Track[]
}

export interface Shelf {
  id: string
  title: string
  tracks: Track[]
}

export type StreamSource =
  | { kind: 'url'; url: string; headers?: Record<string, string>; expiresAt?: number; mime?: string }
  | { kind: 'file'; path: string }

export type Health = 'ok' | 'degraded' | 'down'

/**
 * A source finds tracks and resolves them to something playable, just in time.
 * Resolved streams are never persisted - only TrackRefs are.
 */
export interface SourceProvider {
  readonly id: string
  readonly name: string
  readonly capabilities: { search: boolean; browse: boolean; download: boolean; needsKey: boolean }
  init?(cfg: Record<string, unknown>): Promise<void>
  health(): Promise<Health>
  search(q: string, opts: { kind: SearchKind; limit: number; signal?: AbortSignal }): Promise<SearchResult>
  getTrack(id: string): Promise<Track | null>
  resolve(id: string): Promise<StreamSource>
  browse?(): Promise<Shelf[]>
  /** Optional: get a track ready (resolve its stream) so pressing play is instant. */
  warm?(id: string): void
}
