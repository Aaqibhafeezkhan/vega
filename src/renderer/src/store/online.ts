import { create } from 'zustand'
import { load, save } from '@/lib/persist'
import { applyOnlineSources } from '@/lib/sources'

interface OnlineState {
  audius: boolean
  archive: boolean
  radio: boolean
  ytdlp: boolean
  piped: boolean
  pipedInstances: string
  jamendoClientId: string
  setAudius: (on: boolean) => void
  setArchive: (on: boolean) => void
  setRadio: (on: boolean) => void
  setYtdlp: (on: boolean) => void
  setPiped: (on: boolean) => void
  setPipedInstances: (v: string) => void
  setJamendoClientId: (id: string) => void
}

const initial = { audius: load<boolean>('online.audius', true), archive: load<boolean>('online.archive', true), radio: load<boolean>('online.radio', true), ytdlp: load<boolean>('online.ytdlp', false), piped: load<boolean>('online.piped', false), pipedInstances: load<string>('online.pipedInstances', ''), jamendoClientId: load<string>('online.jamendoClientId', '') }
applyOnlineSources(initial)

export const useOnline = create<OnlineState>((set, get) => ({
  ...initial,
  setAudius: (audius) => {
    save('online.audius', audius)
    set({ audius })
    applyOnlineSources(get())
  },
  setArchive: (archive) => {
    save('online.archive', archive)
    set({ archive })
    applyOnlineSources(get())
  },
  setRadio: (radio) => {
    save('online.radio', radio)
    set({ radio })
    applyOnlineSources(get())
  },
  setYtdlp: (ytdlp) => {
    save('online.ytdlp', ytdlp)
    set({ ytdlp })
    applyOnlineSources(get())
  },
  setPiped: (piped) => {
    save('online.piped', piped)
    set({ piped })
    applyOnlineSources(get())
  },
  setPipedInstances: (v) => {
    const pipedInstances = v.trim()
    save('online.pipedInstances', pipedInstances)
    set({ pipedInstances })
    applyOnlineSources(get())
  },
  setJamendoClientId: (id) => {
    const jamendoClientId = id.trim()
    save('online.jamendoClientId', jamendoClientId)
    set({ jamendoClientId })
    applyOnlineSources(get())
  }
}))
