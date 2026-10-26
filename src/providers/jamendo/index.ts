import type { SearchResult, Shelf, SourceProvider } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * Jamendo: ~500k Creative-Commons tracks. Free API, needs a client_id (https://devportal.jamendo.com).
 * Streams are direct mp3 URLs, resolved just in time.
 */

interface JamendoTrack {
  id: string
  name: string
  duration: number
  artist_name: string
  album_name?: string
  album_image?: string
  image?: string
  audio?: string
  releasedate?: string
  musicinfo?: { tags?: { genres?: string[] } }
}

interface JamendoResponse {
  headers: { status: string; code: number; error_message?: string }
  results: JamendoTrack[]
}

export interface JamendoOptions {
  clientId: string
  base?: string
  fetchImpl?: typeof fetch
}

const SHELVES: { id: string; title: string; params: Record<string, string> }[] = [
  { id: 'jamendo-popular', title: 'Popular on Jamendo', params: { order: 'popularity_week' } },
  { id: 'jamendo-electronic', title: 'Electronic on Jamendo', params: { order: 'popularity_week', tags: 'electronic' } },
  { id: 'jamendo-jazz', title: 'Jazz on Jamendo', params: { order: 'popularity_week', tags: 'jazz' } }
]

export function createJamendoProvider(opts: JamendoOptions): SourceProvider {
  const base = (opts.base ?? 'https://api.jamendo.com/v3.0').replace(/\/$/, '')
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))

  async function query(params: Record<string, string | number>, signal?: AbortSignal): Promise<JamendoTrack[]> {
    const qs = new URLSearchParams({
      client_id: opts.clientId,
      format: 'json',
      audioformat: 'mp32',
      imagesize: '300',
      include: 'musicinfo',
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    })
    const res = await doFetch(`${base}/tracks/?${qs}`, { signal })
    if (!res.ok) throw new Error(`Jamendo ${res.status}`)
    const body = (await res.json()) as JamendoResponse
    if (body.headers.status !== 'success') throw new Error(`Jamendo: ${body.headers.error_message ?? 'request failed'}`)
    return body.results
  }

  const toTrack = (t: JamendoTrack): Track => {
    const year = t.releasedate ? Number(t.releasedate.slice(0, 4)) : NaN
    return {
      ref: { source: 'jamendo', id: String(t.id) },
      title: t.name,
      artists: [t.artist_name],
      album: t.album_name || undefined,
      durationMs: Math.round(t.duration * 1000),
      genres: t.musicinfo?.tags?.genres?.length ? t.musicinfo.tags.genres.slice(0, 2).map(capitalize) : undefined,
      year: Number.isFinite(year) && year > 1900 ? year : undefined,
      artworkUrl: t.image || t.album_image || undefined
    }
  }

  return {
    id: 'jamendo',
    name: 'Jamendo',
    capabilities: { search: true, browse: true, download: false, needsKey: true },

    async health() {
      try {
        await query({ limit: 1 })
        return 'ok'
      } catch {
        return 'down'
      }
    },

    async search(q, { limit, signal }): Promise<SearchResult> {
      if (!q.trim()) return { tracks: [] }
      return { tracks: (await query({ search: q, limit: Math.min(50, limit) }, signal)).map(toTrack) }
    },

    async getTrack(id) {
      const [t] = await query({ id, limit: 1 })
      return t ? toTrack(t) : null
    },

    async resolve(id) {
      const [t] = await query({ id, limit: 1 })
      if (!t?.audio) throw new Error('Jamendo track has no stream')
      return { kind: 'url', url: t.audio, mime: 'audio/mpeg' }
    },

    async browse(): Promise<Shelf[]> {
      const settled = await Promise.allSettled(SHELVES.map((s) => query({ ...s.params, limit: 15 })))
      const shelves: Shelf[] = []
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.length) shelves.push({ id: SHELVES[i]!.id, title: SHELVES[i]!.title, tracks: r.value.map(toTrack) })
      })
      if (!shelves.length) throw new Error('Jamendo unavailable')
      return shelves
    }
  }
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
