import type { Track } from '@shared/types'
import { load, save } from './persist'
import { supabase } from './supabase'

/** Anonymous play counting (no user id) that powers the "Trending on Vega" shelf. On by default, with an opt-out. */
export const pingsEnabled = (): boolean => load<boolean>('privacy.pings', true)
export const setPingsEnabled = (on: boolean): void => save('privacy.pings', on)

/** Only YouTube Music tracks are counted: they are the ones the shared shelves can replay everywhere. */
export function pingPlay(track: Track): void {
  if (!supabase || !pingsEnabled() || track.ref.source !== 'ytm') return
  void supabase
    .rpc('bump_play', { p_source: 'ytm', p_id: track.ref.id, p_title: track.title, p_artists: track.artists, p_thumb: track.artworkUrl ?? null, p_duration_ms: track.durationMs })
    .then(undefined, () => undefined)
}

interface Row {
  id: string
  title: string
  artists: string[]
  thumb: string | null
  duration_ms: number
}

export async function fetchTrending(limit = 16): Promise<Track[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('trending', { p_limit: limit })
    if (error || !data) return []
    return (data as Row[]).map((r) => ({ ref: { source: 'ytm', id: r.id }, title: r.title, artists: r.artists, durationMs: r.duration_ms, artworkUrl: r.thumb ?? undefined }))
  } catch {
    return []
  }
}
