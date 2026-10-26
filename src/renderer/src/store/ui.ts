import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'stats' }
  | { name: 'sources' }
  | { name: 'account' }
  | { name: 'radio' }
  | { name: 'playlist'; id: string }
  | { name: 'smart'; id: string }

export type Panel = 'queue' | null

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'ok' | 'error'
}

interface UiState {
  view: View
  history: View[]
  cursor: number
  panel: Panel
  nowPlaying: boolean
  commandOpen: boolean
  eqOpen: boolean
  query: string
  toasts: Toast[]
  go: (v: View) => void
  back: () => void
  forward: () => void
  togglePanel: (p: Exclude<Panel, null>) => void
  closePanel: () => void
  openNowPlaying: () => void
  closeNowPlaying: () => void
  setCommandOpen: (on: boolean) => void
  setEqOpen: (on: boolean) => void
  setQuery: (q: string) => void
  toast: (text: string, kind?: Toast['kind']) => void
}

let toastSeq = 0

export const useUi = create<UiState>((set, get) => ({
  view: { name: 'home' },
  history: [{ name: 'home' }],
  cursor: 0,
  panel: null,
  nowPlaying: false,
  commandOpen: false,
  eqOpen: false,
  query: '',
  toasts: [],

  go: (view) => {
    const { history, cursor, view: cur } = get()
    if (JSON.stringify(cur) === JSON.stringify(view)) return
    const next = [...history.slice(0, cursor + 1), view].slice(-50)
    set({ view, history: next, cursor: next.length - 1 })
  },
  back: () => {
    const { history, cursor } = get()
    if (cursor > 0) set({ cursor: cursor - 1, view: history[cursor - 1]! })
  },
  forward: () => {
    const { history, cursor } = get()
    if (cursor < history.length - 1) set({ cursor: cursor + 1, view: history[cursor + 1]! })
  },
  togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p })),
  closePanel: () => set({ panel: null }),
  openNowPlaying: () => set({ nowPlaying: true }),
  closeNowPlaying: () => set({ nowPlaying: false }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setEqOpen: (eqOpen) => set({ eqOpen }),
  setQuery: (query) => set({ query }),
  toast: (text, kind = 'info') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
  }
}))
