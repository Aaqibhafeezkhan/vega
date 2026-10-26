import type { SearchKind, SearchResult, Shelf, SourceProvider, StreamSource } from '@shared/provider'
import type { Track } from '@shared/types'

/**
 * Mock source: a fictional catalog with deterministic synthesized audio, so the whole app
 * (search, queue, playlists, analytics, recs) can be built and tested with no files or network.
 * Replaced in M2/M3 by the local-files and online providers behind the same SourceProvider interface.
 */

const ARTISTS: { name: string; genres: string[]; albums: string[] }[] = [
  { name: 'Nova Lumen', genres: ['Synthwave', 'Electronic'], albums: ['Neon Harbor', 'Afterglow'] },
  { name: 'The Paper Moons', genres: ['Indie', 'Folk'], albums: ['Small Hours', 'Kitchen Light'] },
  { name: 'Kairo Vale', genres: ['Hip-Hop', 'Jazz'], albums: ['Blue Pages'] },
  { name: 'Selene & The Tides', genres: ['Dream Pop', 'Indie'], albums: ['Saltwater Letters', 'Low Tide'] },
  { name: 'Orbit Kids', genres: ['Electronic', 'House'], albums: ['Playground Physics'] },
  { name: 'Marlow Quartet', genres: ['Jazz', 'Classical'], albums: ['Late Set', 'Rainy Tuesday'] },
  { name: 'Iron Orchard', genres: ['Rock', 'Alternative'], albums: ['Rust Belt Hymns', 'Voltage'] },
  { name: 'Mika Ono', genres: ['Lo-fi', 'Ambient'], albums: ['Window Seat'] }
]

const WORDS_A = ['Midnight', 'Golden', 'Paper', 'Electric', 'Quiet', 'Velvet', 'Distant', 'Neon', 'Hollow', 'Slow', 'Crystal', 'Faded']
const WORDS_B = ['Signals', 'Summer', 'Echoes', 'Drive', 'Letters', 'Skyline', 'Rain', 'Gravity', 'Daydream', 'Machine', 'Harbor', 'Fire']

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function buildCatalog(): Track[] {
  const rnd = mulberry32(1337)
  const tracks: Track[] = []
  let n = 0
  for (const a of ARTISTS) {
    for (const album of a.albums) {
      const count = 3 + Math.floor(rnd() * 3)
      for (let i = 0; i < count; i++) {
        const title = `${WORDS_A[Math.floor(rnd() * WORDS_A.length)]} ${WORDS_B[Math.floor(rnd() * WORDS_B.length)]}`
        const id = `m${String(++n).padStart(3, '0')}`
        tracks.push({
          ref: { source: 'mock', id },
          title,
          artists: [a.name],
          album,
          genres: a.genres,
          year: 2012 + Math.floor(rnd() * 13),
          // demo tracks are short so they can be heard to the end while testing queue/analytics
          durationMs: (18 + Math.floor(rnd() * 14)) * 1000
        })
      }
    }
  }
  return tracks
}

const CATALOG = buildCatalog()
const BY_ID = new Map(CATALOG.map((t) => [t.ref.id, t]))

const SCALES: number[][] = [
  [0, 2, 4, 7, 9], // major pentatonic
  [0, 3, 5, 7, 10], // minor pentatonic
  [0, 2, 3, 7, 8] // hirajoshi-ish
]

/** Deterministic little arpeggio + pad, 22.05 kHz mono 16-bit WAV. */
function synthWav(track: Track): Blob {
  const rate = 22050
  const seconds = track.durationMs / 1000
  const total = Math.floor(rate * seconds)
  const seed = [...track.ref.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)
  const rnd = mulberry32(seed)
  const scale = SCALES[Math.floor(rnd() * SCALES.length)] ?? SCALES[0]!
  const root = 48 + Math.floor(rnd() * 12)
  const bpm = 88 + Math.floor(rnd() * 50)
  const step = (60 / bpm / 2) * rate
  const pattern = Array.from({ length: 16 }, () => scale[Math.floor(rnd() * scale.length)]! + (rnd() < 0.25 ? 12 : 0))
  const freq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

  const data = new Int16Array(total)
  for (let i = 0; i < total; i++) {
    const s = Math.floor(i / step)
    const t = (i - s * step) / rate
    const f = freq(root + pattern[s % pattern.length]!)
    const env = Math.exp(-t * 5)
    const lead = Math.sin(2 * Math.PI * f * (i / rate)) * env * 0.35 + Math.sin(2 * Math.PI * f * 2 * (i / rate)) * env * 0.08
    const pad = Math.sin(2 * Math.PI * freq(root - 12) * (i / rate)) * 0.12
    const fade = Math.min(1, i / (rate * 0.05), (total - i) / (rate * 0.6))
    data[i] = Math.max(-1, Math.min(1, (lead + pad) * fade)) * 32767
  }

  const buf = new ArrayBuffer(44 + data.length * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string): void => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + data.length * 2, true)
  w(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, data.length * 2, true)
  new Int16Array(buf, 44).set(data)
  return new Blob([buf], { type: 'audio/wav' })
}

const urlCache = new Map<string, string>()

export function createMockProvider(): SourceProvider {
  return {
    id: 'mock',
    name: 'Demo catalog',
    capabilities: { search: true, browse: true, download: false, needsKey: false },
    async health() {
      return 'ok'
    },
    async search(q: string, opts: { kind: SearchKind; limit: number }): Promise<SearchResult> {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
      if (!terms.length) return { tracks: [] }
      const scored = CATALOG.map((t) => {
        const hay = `${t.title} ${t.artists.join(' ')} ${t.album ?? ''} ${(t.genres ?? []).join(' ')}`.toLowerCase()
        const hits = terms.filter((w) => hay.includes(w)).length
        const title = terms.filter((w) => t.title.toLowerCase().includes(w)).length
        return { t, score: hits === terms.length ? hits * 2 + title : 0 }
      })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
      return { tracks: scored.slice(0, opts.limit).map((x) => x.t) }
    },
    async getTrack(id: string) {
      return BY_ID.get(id) ?? null
    },
    async resolve(id: string): Promise<StreamSource> {
      const t = BY_ID.get(id)
      if (!t) throw new Error(`unknown mock track ${id}`)
      let url = urlCache.get(id)
      if (!url) {
        url = URL.createObjectURL(synthWav(t))
        urlCache.set(id, url)
      }
      return { kind: 'url', url, mime: 'audio/wav' }
    },
    async browse(): Promise<Shelf[]> {
      const byGenre = new Map<string, Track[]>()
      for (const t of CATALOG) for (const g of t.genres ?? []) byGenre.set(g, [...(byGenre.get(g) ?? []), t])
      return [
        { id: 'mock-new', title: 'Fresh in the demo catalog', tracks: [...CATALOG].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 10) },
        ...['Electronic', 'Indie', 'Jazz'].map((g) => ({ id: `mock-${g}`, title: `${g} picks`, tracks: (byGenre.get(g) ?? []).slice(0, 10) }))
      ]
    }
  }
}

export const MOCK_CATALOG = CATALOG
