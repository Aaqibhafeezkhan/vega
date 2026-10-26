import { refKey, type PlayEvent } from './types'

/** An entity that can be edited on several devices: identified by key, newest edit wins, deletes are tombstones. */
export interface Versioned<T> {
  key: string
  /** Client wall-clock ms of the last edit. */
  at: number
  deleted: boolean
  value: T
}

export interface Reconciled<T> {
  /** Remote versions that should replace/insert locally. */
  toLocal: Versioned<T>[]
  /** Local versions that the cloud lacks or has older. */
  toRemote: Versioned<T>[]
}

/** Last-write-wins merge. Ties keep both sides as they are, so repeated syncs converge and stay quiet. */
export function reconcile<T>(local: Versioned<T>[], remote: Versioned<T>[]): Reconciled<T> {
  const l = new Map(local.map((v) => [v.key, v]))
  const r = new Map(remote.map((v) => [v.key, v]))
  const toLocal: Versioned<T>[] = []
  const toRemote: Versioned<T>[] = []
  for (const [key, rv] of r) {
    const lv = l.get(key)
    if (!lv) {
      if (!rv.deleted) toLocal.push(rv) // an unknown tombstone has nothing to delete here
    } else if (rv.at > lv.at) toLocal.push(rv)
    else if (rv.at < lv.at) toRemote.push(lv)
  }
  for (const [key, lv] of l) if (!r.has(key)) toRemote.push(lv)
  return { toLocal, toRemote }
}

/** Deterministic id so the same listen uploaded twice (or from two paths) is one row. */
export const eventId = (e: Pick<PlayEvent, 'startedAt' | 'track'>): string => `${e.startedAt}-${refKey(e.track.ref)}`

/** Events are append-only: merge is a union by id. */
export function mergeEvents(local: PlayEvent[], remote: PlayEvent[]): { toLocal: PlayEvent[]; toRemote: PlayEvent[] } {
  const l = new Set(local.map(eventId))
  const r = new Set(remote.map(eventId))
  return {
    toLocal: remote.filter((e) => !l.has(eventId(e))),
    toRemote: local.filter((e) => !r.has(eventId(e)))
  }
}
