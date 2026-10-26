/**
 * MusicBrainz artist tags (free, no key, CORS-open). Used to give untagged tracks genres so recommendations
 * and smart playlists work for online sources too. One request per second per MusicBrainz's etiquette.
 */

interface MbArtist {
  name: string
  score?: number
  tags?: { name: string; count: number }[]
}

export interface MusicBrainzOptions {
  fetchImpl?: typeof fetch
  base?: string
  minIntervalMs?: number
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Tags that describe things other than genre. */
const NOISE = new Set(['seen live', 'favorites', 'favourite', 'albums i own', 'under 2000 listeners', 'all', 'spotify'])

const titleCase = (s: string): string => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())

export function pickGenres(artist: MbArtist | undefined, wanted: string): string[] {
  if (!artist || (artist.score ?? 0) < 90 || norm(artist.name) !== norm(wanted)) return []
  return (artist.tags ?? [])
    .filter((t) => t.count > 0 && !NOISE.has(t.name.toLowerCase()) && t.name.length <= 30)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => titleCase(t.name))
}

export function createMusicBrainz(opts: MusicBrainzOptions = {}) {
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))
  const base = (opts.base ?? 'https://musicbrainz.org/ws/2').replace(/\/$/, '')
  const gap = opts.minIntervalMs ?? 1100
  let chain: Promise<unknown> = Promise.resolve()
  let lastAt = 0

  /** Serialises requests with a minimum gap so we never exceed the rate limit. */
  function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = lastAt + gap - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      try {
        return await fn()
      } finally {
        lastAt = Date.now()
      }
    })
    chain = run.catch(() => undefined)
    return run
  }

  return {
    /** Top genres for an artist, [] if unknown. Throws on network/HTTP errors so callers can retry later. */
    artistGenres(name: string): Promise<string[]> {
      return throttled(async () => {
        const q = `artist:"${name.replace(/["\\]/g, ' ')}"`
        const res = await doFetch(`${base}/artist/?query=${encodeURIComponent(q)}&fmt=json&limit=3`)
        if (res.status === 503 || res.status === 429) throw new Error('MusicBrainz rate limited')
        if (!res.ok) throw new Error(`MusicBrainz ${res.status}`)
        const body = (await res.json()) as { artists?: MbArtist[] }
        const exact = body.artists?.find((a) => norm(a.name) === norm(name) && (a.score ?? 0) >= 90)
        return pickGenres(exact, name)
      })
    }
  }
}
