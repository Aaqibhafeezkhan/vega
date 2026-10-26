/**
 * Background videos/images the user imports. They stay inside this browser/app profile (IndexedDB), never uploaded.
 * The resolver asks for URLs synchronously, so every stored file gets an object URL up front (`hydrateMedia`).
 */

const DB = 'vega-lyra-media'
const STORE = 'files'
const urls = new Map<string, string>()

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const wrap = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

async function sha(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hydrateMedia(): Promise<void> {
  try {
    const db = await open()
    const store = db.transaction(STORE).objectStore(STORE)
    const [keys, blobs] = await Promise.all([wrap(store.getAllKeys()), wrap(store.getAll() as IDBRequest<Blob[]>)])
    keys.forEach((k, i) => urls.set(String(k), URL.createObjectURL(blobs[i]!)))
  } catch {
    /* no storage: imported backgrounds just will not persist */
  }
}

/** Stores the file (de-duplicated by content) and returns the id used as `BackgroundMedia.file`. */
export async function saveMedia(file: File): Promise<string> {
  const id = `${await sha(file)}.${(file.name.split('.').pop() ?? 'bin').toLowerCase().slice(0, 5)}`
  if (!urls.has(id)) {
    urls.set(id, URL.createObjectURL(file))
    try {
      const db = await open()
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(file, id)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    } catch {
      /* keep the in-memory copy for this session */
    }
  }
  return id
}

export const mediaUrl = (id: string): string | null => urls.get(id) ?? null

export async function deleteMedia(id: string): Promise<void> {
  const u = urls.get(id)
  if (u) URL.revokeObjectURL(u)
  urls.delete(id)
  try {
    const db = await open()
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
  } catch {
    /* ignore */
  }
}
