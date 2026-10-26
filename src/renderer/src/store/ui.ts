import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'stats' }
  | { name: 'sources' }
  | { name: 'account' }
  | { name: 'playlist'; id: string }
  | { name: 'smart'; id: string }

export type Panel = 'queue' | null

interface UiState {
  view: View
  panel: Panel
  nowPlaying: boolean
  query: string
  go: (v: View) => void
  togglePanel: (p: Exclude<Panel, null>) => void
  closePanel: () => void
  openNowPlaying: () => void
  closeNowPlaying: () => void
  setQuery: (q: string) => void
}

export const useUi = create<UiState>((set) => ({
  view: { name: 'home' },
  panel: null,
  nowPlaying: false,
  query: '',
  go: (view) => set({ view }),
  togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p })),
  closePanel: () => set({ panel: null }),
  openNowPlaying: () => set({ nowPlaying: true }),
  closeNowPlaying: () => set({ nowPlaying: false }),
  setQuery: (query) => set({ query })
}))
