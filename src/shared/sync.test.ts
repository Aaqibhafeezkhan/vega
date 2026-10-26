import { describe, expect, it } from 'vitest'
import { eventId, mergeEvents, reconcile, type Versioned } from './sync'
import type { PlayEvent, Track } from './types'

const v = (key: string, at: number, deleted = false, value = key): Versioned<string> => ({ key, at, deleted, value })

describe('reconcile', () => {
  it('copies one-sided entries both ways', () => {
    const r = reconcile([v('a', 1)], [v('b', 1)])
    expect(r.toLocal.map((x) => x.key)).toEqual(['b'])
    expect(r.toRemote.map((x) => x.key)).toEqual(['a'])
  })

  it('newest edit wins, ties are quiet', () => {
    const r = reconcile([v('a', 5, false, 'local'), v('b', 1), v('c', 3)], [v('a', 2, false, 'remote'), v('b', 9, false, 'remote'), v('c', 3)])
    expect(r.toRemote.map((x) => x.key)).toEqual(['a'])
    expect(r.toLocal.map((x) => x.key)).toEqual(['b'])
  })

  it('deletes propagate as tombstones, and a newer edit resurrects', () => {
    const del = reconcile([v('a', 1)], [v('a', 2, true)])
    expect(del.toLocal[0]).toMatchObject({ key: 'a', deleted: true })
    const back = reconcile([v('a', 5)], [v('a', 2, true)])
    expect(back.toRemote[0]).toMatchObject({ key: 'a', deleted: false })
  })

  it('ignores remote tombstones for things we never had, but still pushes our tombstones', () => {
    expect(reconcile([], [v('x', 1, true)]).toLocal).toEqual([])
    expect(reconcile([v('y', 1, true)], []).toRemote).toHaveLength(1)
  })

  it('converges: applying the result makes a second pass empty', () => {
    const local = [v('a', 5), v('b', 1), v('d', 4, true)]
    const remote = [v('a', 2), v('b', 7), v('c', 3)]
    const r = reconcile(local, remote)
    const merged = new Map(local.map((x) => [x.key, x]))
    r.toLocal.forEach((x) => merged.set(x.key, x))
    const remoteMerged = new Map(remote.map((x) => [x.key, x]))
    r.toRemote.forEach((x) => remoteMerged.set(x.key, x))
    const again = reconcile([...merged.values()], [...remoteMerged.values()])
    expect(again.toLocal).toEqual([])
    expect(again.toRemote).toEqual([])
  })
})

describe('mergeEvents', () => {
  const t = (id: string): Track => ({ ref: { source: 'mock', id }, title: id, artists: ['x'], durationMs: 1 })
  const e = (id: string, startedAt: number): PlayEvent => ({ track: t(id), startedAt, listenedMs: 1, counted: true, skipped: false })

  it('unions by deterministic id', () => {
    const local = [e('a', 1), e('b', 2)]
    const remote = [e('b', 2), e('c', 3)]
    const m = mergeEvents(local, remote)
    expect(m.toLocal.map(eventId)).toEqual([eventId(e('c', 3))])
    expect(m.toRemote.map(eventId)).toEqual([eventId(e('a', 1))])
  })
})
