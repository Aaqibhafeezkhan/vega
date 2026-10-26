import { useEffect, useMemo, useState } from 'react'
import { buildProfile, recommend } from '@shared/recs'
import type { Shelf as ShelfData } from '@shared/provider'
import { refKey, type Track } from '@shared/types'
import { Shelf } from '@/components/Shelf'
import { sources } from '@/lib/sources'
import { useCatalog } from '@/store/catalog'
import { useLibrary } from '@/store/library'

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const events = useLibrary((s) => s.events)
  const seed = useLibrary((s) => s.seedDemoHistory)
  const catalog = useCatalog((s) => s.tracks)
  const [shelves, setShelves] = useState<ShelfData[]>([])

  useEffect(() => {
    let live = true
    void sources.browse().then((s) => live && setShelves(s))
    return () => {
      live = false
    }
  }, [])

  const { recent, mix, discover } = useMemo(() => {
    const profile = buildProfile(events)
    const seen = new Set<string>()
    const recent: Track[] = []
    for (const e of [...events].reverse()) {
      const k = refKey(e.track.ref)
      if (!seen.has(k) && e.counted) {
        seen.add(k)
        recent.push(e.track)
      }
      if (recent.length >= 10) break
    }
    return {
      recent,
      mix: recommend(catalog, profile, { limit: 12 }),
      discover: recommend(catalog, profile, { limit: 12, maxFamiliarity: 0.3, exclude: seen })
    }
  }, [events, catalog])

  return (
    <div className="view">
      <h1>{greeting()}</h1>
      {!events.length && (
        <div className="banner">
          <div>
            <strong>Welcome to Vega.</strong> Play a few songs and recommendations and insights appear here. Or explore with sample history.
          </div>
          <button className="pill" onClick={seed}>
            Load demo history
          </button>
        </div>
      )}
      <Shelf title="Jump back in" tracks={recent} />
      <Shelf title="Made for you" subtitle={events.length ? 'Based on what you play and skip' : 'Your daily mix starts generic and sharpens as you listen'} tracks={mix} />
      <Shelf title="Discover" subtitle="Tracks you have not heard, close to your taste" tracks={discover} />
      {shelves.map((s) => (
        <Shelf key={s.id} title={s.title} tracks={s.tracks} />
      ))}
    </div>
  )
}
