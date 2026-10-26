import type { Health, SearchKind, Shelf, SourceProvider, StreamSource } from './provider'
import type { Track, TrackRef } from './types'

const FAIL_LIMIT = 3
const COOLDOWN_MS = 60_000

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Identity used to collapse the same song offered by several sources. */
export function dedupeKey(t: Track): string {
  if (t.isrc) return `isrc:${t.isrc.toUpperCase()}`
  if (t.mbid) return `mbid:${t.mbid}`
  const bucket = Math.round(t.durationMs / 4000) // coarse +-2 s tolerance
  return `t:${norm(t.artists[0] ?? '')}|${norm(t.title)}|${bucket}`
}

interface Slot {
  provider: SourceProvider
  priority: number
  fails: number
  downUntil: number
}

export interface RegistryEvents {
  onProviderError?(id: string, err: unknown): void
}

/** Fan-out search, dedupe, circuit breaking and resolve fallback across providers. */
export class SourceRegistry {
  private slots = new Map<string, Slot>()

  constructor(
    private readonly events: RegistryEvents = {},
    private readonly now: () => number = Date.now
  ) {}

  register(provider: SourceProvider, priority = 100): void {
    this.slots.set(provider.id, { provider, priority, fails: 0, downUntil: 0 })
  }

  unregister(id: string): void {
    this.slots.delete(id)
  }

  list(): SourceProvider[] {
    return [...this.slots.values()].sort((a, b) => a.priority - b.priority).map((s) => s.provider)
  }

  get(id: string): SourceProvider | undefined {
    return this.slots.get(id)?.provider
  }

  private available(): Slot[] {
    const t = this.now()
    return [...this.slots.values()].filter((s) => s.downUntil <= t).sort((a, b) => a.priority - b.priority)
  }

  private ok(s: Slot): void {
    s.fails = 0
  }

  private fail(s: Slot, err: unknown): void {
    s.fails += 1
    if (s.fails >= FAIL_LIMIT) s.downUntil = this.now() + COOLDOWN_MS
    this.events.onProviderError?.(s.provider.id, err)
  }

  async health(): Promise<Record<string, Health>> {
    const out: Record<string, Health> = {}
    await Promise.all(
      [...this.slots.values()].map(async (s) => {
        try {
          out[s.provider.id] = await s.provider.health()
        } catch {
          out[s.provider.id] = 'down'
        }
      })
    )
    return out
  }

  /**
   * Query every searchable provider in parallel. `onPartial` fires as each answers (so the UI can show local
   * results first); the returned promise resolves with the merged, deduped list in provider-priority order.
   * A slow or failing provider never blocks the others.
   */
  async search(
    q: string,
    opts: {
      kind?: SearchKind
      limit?: number
      timeoutMs?: number
      signal?: AbortSignal
      onPartial?: (tracks: Track[]) => void
    } = {}
  ): Promise<Track[]> {
    const { kind = 'track', limit = 25, timeoutMs = 4000, signal, onPartial } = opts
    const slots = this.available().filter((s) => s.provider.capabilities.search)
    const results: Track[][] = slots.map(() => [])
    const arrived = new Map<string, Track>()

    await Promise.all(
      slots.map(async (s, i) => {
        try {
          const r = await withTimeout(s.provider.search(q, { kind, limit, signal }), timeoutMs)
          this.ok(s)
          results[i] = r.tracks
          if (onPartial && !signal?.aborted) {
            for (const t of r.tracks) if (!arrived.has(dedupeKey(t))) arrived.set(dedupeKey(t), t)
            onPartial([...arrived.values()])
          }
        } catch (err) {
          if (!signal?.aborted) this.fail(s, err)
        }
      })
    )

    const merged = new Map<string, Track>()
    for (const list of results) for (const t of list) if (!merged.has(dedupeKey(t))) merged.set(dedupeKey(t), t)
    return [...merged.values()]
  }

  async browse(): Promise<Shelf[]> {
    const shelves: Shelf[] = []
    for (const s of this.available()) {
      if (!s.provider.browse) continue
      try {
        shelves.push(...(await withTimeout(s.provider.browse(), 4000)))
        this.ok(s)
      } catch (err) {
        this.fail(s, err)
      }
    }
    return shelves
  }

  /** Resolve a track; if its own source fails, try other sources offering the same song (`alternates`). */
  async resolve(track: Track, alternates: Track[] = []): Promise<{ stream: StreamSource; ref: TrackRef }> {
    const same = alternates.filter((a) => dedupeKey(a) === dedupeKey(track) && a.ref.source !== track.ref.source)
    let lastErr: unknown = new Error('no provider available')
    for (const c of [track, ...same]) {
      const slot = this.slots.get(c.ref.source)
      if (!slot || slot.downUntil > this.now()) continue
      try {
        const stream = await slot.provider.resolve(c.ref.id)
        this.ok(slot)
        return { stream, ref: c.ref }
      } catch (err) {
        lastErr = err
        this.fail(slot, err)
      }
    }
    throw lastErr
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}
