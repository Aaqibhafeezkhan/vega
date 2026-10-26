import { create } from 'zustand'
import type { Track } from '@shared/types'
import { MOCK_CATALOG } from '@providers/mock'
import { backend } from '@/lib/backend'
import { load, save } from '@/lib/persist'
import { setDemoEnabled } from '@/lib/sources'

interface CatalogState {
  /** Everything browsable offline right now: local library plus the demo catalog when enabled. Feeds recommendations. */
  tracks: Track[]
  localCount: number
  demo: boolean
  refresh: () => Promise<void>
  setDemo: (on: boolean) => void
}

const initialDemo = load<boolean>('demo', true)
setDemoEnabled(initialDemo)

export const useCatalog = create<CatalogState>((set, get) => ({
  tracks: initialDemo ? MOCK_CATALOG : [],
  localCount: 0,
  demo: initialDemo,

  refresh: async () => {
    const local = backend.supported ? await backend.all(50_000).catch(() => []) : []
    // First real library switches the demo catalog off, unless the user already chose.
    if (local.length && get().demo && load<boolean>('demoChosen', false) === false) {
      save('demo', false)
      setDemoEnabled(false)
      set({ demo: false })
    }
    set({ localCount: local.length, tracks: get().demo ? [...local, ...MOCK_CATALOG] : local })
  },

  setDemo: (on) => {
    save('demo', on)
    save('demoChosen', true)
    setDemoEnabled(on)
    set({ demo: on })
    void get().refresh()
  }
}))
