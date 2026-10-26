/** Last.fm similarity (free API key from last.fm/api). Optional: recommendations work without it. */

export interface LastFmOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  base?: string
}

export function createLastFm(opts: LastFmOptions) {
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...a) => fetch(...a))
  const base = opts.base ?? 'https://ws.audioscrobbler.com/2.0/'

  async function call<T>(params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...params, api_key: opts.apiKey, format: 'json' })
    const res = await doFetch(`${base}?${qs}`)
    if (!res.ok) throw new Error(`Last.fm ${res.status}`)
    const body = (await res.json()) as { error?: number; message?: string } & T
    if (body.error) throw new Error(`Last.fm: ${body.message ?? body.error}`)
    return body
  }

  return {
    async similarArtists(artist: string, limit = 25): Promise<string[]> {
      const r = await call<{ similarartists?: { artist?: { name: string }[] } }>({ method: 'artist.getsimilar', artist, limit: String(limit), autocorrect: '1' })
      return (r.similarartists?.artist ?? []).map((a) => a.name)
    },
    async similarTracks(artist: string, track: string, limit = 25): Promise<{ artist: string; title: string }[]> {
      const r = await call<{ similartracks?: { track?: { name: string; artist: { name: string } }[] } }>({
        method: 'track.getsimilar',
        artist,
        track,
        limit: String(limit),
        autocorrect: '1'
      })
      return (r.similartracks?.track ?? []).map((t) => ({ artist: t.artist.name, title: t.name }))
    },
    async validate(): Promise<boolean> {
      try {
        await call({ method: 'chart.gettopartists', limit: '1' })
        return true
      } catch {
        return false
      }
    }
  }
}
