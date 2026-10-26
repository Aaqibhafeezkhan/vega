import { create } from 'zustand'
import { load, save } from '@/lib/persist'
import { applyOnlineSources } from '@/lib/sources'

interface OnlineState {
  audius: boolean
  archive: boolean
  radio: boolean
  /** YouTube Music catalogue (desktop; on by default) */
  ytm: boolean
  jamendoClientId: string
  setAudius: (on: boolean) => void
  setArchive: (on: boolean) => void
  setRadio: (on: boolean) => void
  setYtm: (on: boolean) => void
  setJamendoClientId: (id: string) => void
}

const initial = {
  audius: load<boolean>('online.audius', true),
  archive: load<boolean>('online.archive', true),
  radio: load<boolean>('online.radio', true),
  ytm: load<boolean>('online.ytm', true),
  jamendoClientId: load<string>('online.jamendoClientId', '')
}
applyOnlineSources(initial)

export const useOnline = create<OnlineState>((set, get) => {
  const toggle = (key: 'audius' | 'archive' | 'radio' | 'ytm') => (on: boolean): void => {
    save(`online.${key}`, on)
    set({ [key]: on } as Partial<OnlineState>)
    applyOnlineSources(get())
  }
  return {
    ...initial,
    setAudius: toggle('audius'),
    setArchive: toggle('archive'),
    setRadio: toggle('radio'),
    setYtm: toggle('ytm'),
    setJamendoClientId: (id) => {
      const jamendoClientId = id.trim()
      save('online.jamendoClientId', jamendoClientId)
      set({ jamendoClientId })
      applyOnlineSources(get())
    }
  }
})
