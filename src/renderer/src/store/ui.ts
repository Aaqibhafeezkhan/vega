import { create } from 'zustand'

export type View = { name: 'home' } | { name: 'search' } | { name: 'library' } | { name: 'stats' } | { name: 'sources' } | { name: 'account' } | { name: 'playlist'; id: string }

interface UiState {
  view: View
  queueOpen: boolean
  query: string
  go: (v: View) => void
  toggleQueue: () => void
  setQuery: (q: string) => void
}

export const useUi = create<UiState>((set) => ({
  view: { name: 'home' },
  queueOpen: false,
  query: '',
  go: (view) => set({ view }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  setQuery: (query) => set({ query })
}))
