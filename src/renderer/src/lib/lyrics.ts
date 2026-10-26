import { parseLrc } from '@shared/lrc'
import { LyricsProviderError, type LyricsProvider, type LyricsQuery, type ProviderResult } from '@shared/lyrics/provider'
import { refKey, type LyricsResult, type Track } from '@shared/types'
import { LrcLibProvider } from '@providers/lyrics/lrclib'
import { load, save } from './persist'

const FOUND_TTL = 30 * 24 * 3600_000
const NONE_TTL = 12 * 3600_000
const MAX_ENTRIES = 400

interface Entry {
  at: number
  result: LyricsResult
}

const provider: LyricsProvider = new LrcLibProvider()
const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<LyricsResult>>()
let index = load<string[]>('lyrics.index', [])

const ck = (key: string): string => `lyrics.c.${key}`

function readCache(key: string): LyricsResult | null {
  const entry = memory.get(key) ?? load<Entry | null>(ck(key), null)
  if (!entry) return null
  const ttl = entry.result.status === 'none' ? NONE_TTL : FOUND_TTL
  if (Date.now() - entry.at > ttl) return null
  memory.set(key, entry)
  return entry.result
}

function writeCache(key: string, result: LyricsResult): void {
  if (result.status === 'error') return // never cache failures
  const entry: Entry = { at: Date.now(), result }
  memory.set(key, entry)
  save(ck(key), entry)
  index = [key, ...index.filter((k) => k !== key)]
  if (index.length > MAX_ENTRIES) {
    for (const old of index.slice(MAX_ENTRIES)) {
      memory.delete(old)
      save(ck(old), null)
    }
    index = index.slice(0, MAX_ENTRIES)
  }
  save('lyrics.index', index)
}

export function queryFor(t: Track): LyricsQuery {
  return { trackId: refKey(t.ref), title: t.title, artist: t.artists.join(', '), album: t.album ?? '', durationMs: t.durationMs }
}

export function toResult(key: string, p: ProviderResult, providerId: string): LyricsResult {
  if (p.kind === 'none') return { trackKey: key, status: 'none', provider: providerId, lines: [] }
  if (p.instrumental) return { trackKey: key, status: 'instrumental', provider: providerId, lines: [], matched: p.matched }
  const lines = p.synced ? parseLrc(p.synced) : []
  if (lines.length) return { trackKey: key, status: 'synced', provider: providerId, lines, wordSynced: lines.some((l) => (l.words?.length ?? 0) > 1), matched: p.matched }
  if (p.plain) return { trackKey: key, status: 'plain', provider: providerId, lines: [], plain: p.plain, matched: p.matched }
  return { trackKey: key, status: 'none', provider: providerId, lines: [] }
}

/** Lyrics for a track: cached, de-duplicated while in flight, errors reported (never cached). */
export function fetchLyrics(track: Track, signal: AbortSignal, force = false): Promise<LyricsResult> {
  const key = refKey(track.ref)
  if (!force) {
    const hit = readCache(key)
    if (hit) return Promise.resolve(hit)
  }
  const running = inflight.get(key)
  if (running && !force) return running
  const p = (async (): Promise<LyricsResult> => {
    try {
      const result = toResult(key, await provider.fetch(queryFor(track), signal), provider.id)
      writeCache(key, result)
      return result
    } catch (e) {
      if (signal.aborted) throw e
      const err = e instanceof LyricsProviderError ? e : new LyricsProviderError((e as Error).message, 'unknown')
      return { trackKey: key, status: 'error', provider: provider.id, lines: [], error: { kind: err.kind, message: err.message, retryable: err.retryable } }
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}
