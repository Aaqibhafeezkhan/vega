/**
 * Self-update of the Android app (no app store). Finds the newest GitHub release like the desktop updater does, has the
 * native shell download its APK and install it with the system installer (see AppUpdater.kt). Only active inside the
 * Android app (window.vegaAndroid); the web version is always current and the desktop app has its own updater.
 */
import { create } from 'zustand'
import { load } from './persist'
import { fetchDownloads, isNewer } from './downloads'

export interface AndroidUpdateState {
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'
  installed: string
  latest: string
  percent: number
  message: string
}

export const useAndroidUpdate = create<AndroidUpdateState>(() => ({ state: 'idle', installed: '', latest: '', percent: 0, message: '' }))
const set = useAndroidUpdate.setState
let apkUrl: string | null = null

interface Port {
  postMessage(msg: string): void
  onmessage: ((e: { data: string }) => void) | null
}
const port = (): Port | undefined => (window as unknown as { vegaAndroid?: Port }).vegaAndroid

export const isAndroidApp = (): boolean => !!port()

export function startDownload(): void {
  if (!apkUrl) return
  set({ state: 'downloading', percent: 0, message: '' })
  port()?.postMessage(JSON.stringify({ type: 'update-download', url: apkUrl }))
}

export function installUpdate(): void {
  port()?.postMessage(JSON.stringify({ type: 'update-install' }))
}

export async function checkForUpdate(): Promise<void> {
  const cur = useAndroidUpdate.getState()
  if (!isAndroidApp() || ['checking', 'downloading', 'ready', 'installing'].includes(cur.state)) return
  set({ state: 'checking', message: '' })
  const d = await fetchDownloads(true)
  const { installed } = useAndroidUpdate.getState()
  if (!d.version || !d.android) return set({ state: 'error', message: 'Could not reach the release page' })
  if (installed && isNewer(d.version, installed)) {
    apkUrl = d.android
    set({ state: 'available', latest: d.version })
    if (load<boolean>('update.auto', true)) startDownload()
  } else set({ state: 'none', latest: d.version })
}

export function initAndroidUpdate(): void {
  const p = port()
  if (!p) return
  p.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data) as { type: string; version?: string; state?: string; percent?: number; message?: string }
      if (m.type === 'info' && m.version) {
        set({ installed: m.version })
        void checkForUpdate()
      } else if (m.type === 'update') {
        if (m.state === 'downloading') set({ state: 'downloading', percent: m.percent ?? 0 })
        else if (m.state === 'ready') set({ state: 'ready', percent: 100 })
        else if (m.state === 'installing') set({ state: 'installing' })
        else if (m.state === 'error') set({ state: 'error', message: m.message ?? 'update failed' })
      }
    } catch {
      /* ignore */
    }
  }
  p.postMessage(JSON.stringify({ type: 'hello' }))
  setInterval(() => void checkForUpdate(), 6 * 3600_000)
}
