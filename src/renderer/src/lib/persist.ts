import { backend } from './backend'

/**
 * Durable app state (likes, playlists, play history, settings). Reads are synchronous from an in-memory cache
 * filled once by `initStorage()` before the UI mounts; writes go through to the backend (SQLite on desktop,
 * IndexedDB on web).
 */
let cache: Record<string, string> = {}

export async function initStorage(): Promise<void> {
  try {
    cache = await backend.kvGetAll()
  } catch (err) {
    console.warn('storage init failed, starting empty', err)
  }
}

export function load<T>(key: string, fallback: T): T {
  try {
    let raw = cache[key]
    if (raw === undefined) {
      // one-time migration of M1 data that lived in localStorage
      raw = localStorage.getItem(`vega:${key}`) ?? undefined
      if (raw !== undefined) cache[key] = raw
    }
    return raw !== undefined ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Debounced write so rapid updates (play logs) hit storage once. */
export function save(key: string, value: unknown): void {
  const raw = JSON.stringify(value)
  cache[key] = raw
  clearTimeout(timers.get(key))
  timers.set(
    key,
    setTimeout(() => {
      backend.kvSet(key, raw).catch((err) => console.warn('persist failed', key, err))
    }, 300)
  )
}
