import { create } from 'zustand'
import { load, save } from '@/lib/persist'
import { applyOnlineSources } from '@/lib/sources'

interface OnlineState {
  audius: boolean
  jamendoClientId: string
  setAudius: (on: boolean) => void
  setJamendoClientId: (id: string) => void
}

const initial = { audius: load<boolean>('online.audius', true), jamendoClientId: load<string>('online.jamendoClientId', '') }
applyOnlineSources(initial)

export const useOnline = create<OnlineState>((set, get) => ({
  ...initial,
  setAudius: (audius) => {
    save('online.audius', audius)
    set({ audius })
    applyOnlineSources(get())
  },
  setJamendoClientId: (id) => {
    const jamendoClientId = id.trim()
    save('online.jamendoClientId', jamendoClientId)
    set({ jamendoClientId })
    applyOnlineSources(get())
  }
}))
