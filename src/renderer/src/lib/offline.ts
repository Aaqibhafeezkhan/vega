import { refKey, type Track } from '@shared/types'
import { sources } from './sources'

/**
 * Web offline saves: a private copy of a song on the user's own device (IndexedDB), only for sources whose audio is
 * openly licensed or artist-published and CORS-readable (Audius, Jamendo, Internet Archive). Nothing is uploaded anywhere.
 * Desktop has its own stream cache, so this is web only.
 */

const DB = 'vega-offline'
const STORE = 'audio'
const LIMIT_BYTES = 400 * 1024 * 1024
const ELIGIBLE = new Set(['audius', 'jamendo', 'archive'])

interface Entry {
  key: string
  blob: Blob
  bytes: number
  title: string
  at: number
}

const supported = (): boolean => !window.vega && typeof indexedDB !== 'undefined'
export const canSaveOffline = (t: Track): boolean => supported() && ELIGIBLE.has(t.ref.source)

let dbp: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const all = (): Promise<Entry[]> => tx('readonly', (s) => s.getAll() as IDBRequest<Entry[]>)

export async function isSavedOffline(t: Track): Promise<boolean> {
  if (!supported()) return false
  return (await tx('readonly', (s) => s.count(refKey(t.ref)))) > 0
}

/** A playable object URL for a saved song, or null. The caller owns revoking it when the track changes. */
export async function offlineUrl(t: Track): Promise<string | null> {
  if (!supported() || !ELIGIBLE.has(t.ref.source)) return null
  const e = (await tx('readonly', (s) => s.get(refKey(t.ref)) as IDBRequest<Entry | undefined>)) ?? null
  return e ? URL.createObjectURL(e.blob) : null
}

export async function saveOffline(t: Track): Promise<void> {
  if (!canSaveOffline(t)) throw new Error('This source cannot be saved offline')
  const { stream } = await sources.resolve(t)
  if (stream.kind !== 'url') throw new Error('Nothing to save')
  const res = await fetch(stream.url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const blob = await res.blob()
  if (blob.size > LIMIT_BYTES / 2) throw new Error('This song is too large to save')
  await makeRoom(blob.size)
  const entry: Entry = { key: refKey(t.ref), blob, bytes: blob.size, title: t.title, at: Date.now() }
  await tx('readwrite', (s) => s.put(entry))
}

export const removeOffline = async (t: Track): Promise<void> => {
  await tx('readwrite', (s) => s.delete(refKey(t.ref)))
}

export async function clearOffline(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}

export async function offlineStats(): Promise<{ count: number; bytes: number }> {
  if (!supported()) return { count: 0, bytes: 0 }
  const list = await all()
  return { count: list.length, bytes: list.reduce((n, e) => n + e.bytes, 0) }
}

/** Oldest saves go first when the cap would be exceeded. */
async function makeRoom(incoming: number): Promise<void> {
  const list = (await all()).sort((a, b) => a.at - b.at)
  let used = list.reduce((n, e) => n + e.bytes, 0)
  for (const e of list) {
    if (used + incoming <= LIMIT_BYTES) break
    await tx('readwrite', (s) => s.delete(e.key))
    used -= e.bytes
  }
}
