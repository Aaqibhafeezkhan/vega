import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlayEvent, Playlist, Track } from '@shared/types'
import { eventId, mergeEvents, reconcile, type Versioned } from '@shared/sync'
import { load, save } from './persist'
import { useLibrary } from '@/store/library'

const PAGE = 1000
const BATCH = 400

interface LikedRow {
  track_key: string
  track: Track
  updated_at: number
  deleted: boolean
}
interface PlaylistRow {
  id: string
  name: string
  description: string | null
  tracks: Track[]
  created_at: number
  updated_at: number
  deleted: boolean
}
interface EventRow {
  id: string
  track: Track
  started_at: number
  listened_ms: number
  counted: boolean
  skipped: boolean
  synced_at: string
}

const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

const must = (r: { error: { message: string } | null }): void => {
  if (r.error) throw new Error(r.error.message)
}

/**
 * One full reconciliation pass for a signed-in user: pull remote, merge (last-write-wins for likes and playlists,
 * union for append-only play events), apply remote changes locally, push local changes. Safe to run repeatedly.
 */
export async function syncOnce(sb: SupabaseClient, userId: string): Promise<{ pulled: number; pushed: number }> {
  const lib = useLibrary.getState()

  // ---- likes ----
  const remoteLikes = (await pageAll<LikedRow>((a, b) => sb.from('liked_tracks').select('track_key, track, updated_at, deleted').range(a, b))).map(
    (r): Versioned<Track> => ({ key: r.track_key, at: r.updated_at, deleted: r.deleted, value: r.track })
  )
  const likes = reconcile(lib.snapshotLikes(), remoteLikes)

  // ---- playlists ----
  const remotePl = await pageAll<PlaylistRow>((a, b) => sb.from('playlists').select('id, name, description, tracks, created_at, updated_at, deleted').range(a, b))
  const remotePlV = remotePl.map(
    (r): Versioned<Playlist> => ({
      key: r.id,
      at: r.updated_at,
      deleted: r.deleted,
      value: { id: r.id, name: r.name, description: r.description ?? undefined, tracks: r.tracks, createdAt: r.created_at, updatedAt: r.updated_at }
    })
  )
  const pls = reconcile(lib.snapshotPlaylists(), remotePlV)

  // ---- events: pull what arrived since the last pull, push what is newer than the last push ----
  const cursorKey = `sync.${userId}.eventCursor`
  const pushedKey = `sync.${userId}.pushedUntil`
  const cursor = load<string>(cursorKey, '1970-01-01T00:00:00Z')
  const remoteEventRows = await pageAll<EventRow>((a, b) =>
    sb.from('play_events').select('id, track, started_at, listened_ms, counted, skipped, synced_at').gt('synced_at', cursor).order('synced_at').range(a, b)
  )
  const remoteEvents: PlayEvent[] = remoteEventRows.map((r) => ({
    track: r.track,
    startedAt: r.started_at,
    listenedMs: r.listened_ms,
    counted: r.counted,
    skipped: r.skipped
  }))
  const pushedUntil = load<number>(pushedKey, 0)
  const localNew = lib.events.filter((e) => e.startedAt > pushedUntil)
  const ev = mergeEvents(localNew, remoteEvents)

  // ---- apply remote -> local ----
  lib.applyRemote({ likes: likes.toLocal, playlists: pls.toLocal, events: ev.toLocal })

  // ---- push local -> remote ----
  for (const part of chunk(likes.toRemote, BATCH)) {
    must(
      await sb.from('liked_tracks').upsert(
        part.map((v) => ({ user_id: userId, track_key: v.key, track: v.value ?? {}, updated_at: v.at, deleted: v.deleted })),
        { onConflict: 'user_id,track_key' }
      )
    )
  }
  for (const part of chunk(pls.toRemote, BATCH)) {
    must(
      await sb.from('playlists').upsert(
        part.map((v) => ({
          user_id: userId,
          id: v.key,
          name: v.value?.name ?? 'deleted',
          description: v.value?.description ?? null,
          tracks: v.value?.tracks ?? [],
          created_at: v.value?.createdAt ?? v.at,
          updated_at: v.at,
          deleted: v.deleted
        })),
        { onConflict: 'user_id,id' }
      )
    )
  }
  for (const part of chunk(ev.toRemote, BATCH)) {
    must(
      await sb.from('play_events').upsert(
        part.map((e) => ({
          user_id: userId,
          id: eventId(e),
          track: e.track,
          started_at: e.startedAt,
          listened_ms: Math.round(e.listenedMs),
          counted: e.counted,
          skipped: e.skipped
        })),
        { onConflict: 'user_id,id', ignoreDuplicates: true }
      )
    )
  }

  const lastRow = remoteEventRows[remoteEventRows.length - 1]
  if (lastRow) save(cursorKey, lastRow.synced_at)
  const maxLocal = useLibrary.getState().events.reduce((m, e) => Math.max(m, e.startedAt), pushedUntil)
  save(pushedKey, maxLocal)
  return {
    pulled: likes.toLocal.length + pls.toLocal.length + ev.toLocal.length,
    pushed: likes.toRemote.length + pls.toRemote.length + ev.toRemote.length
  }
}
