import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH, EV, type VegaDesktopApi } from '@shared/ipc'
import type { ScanProgress } from '@shared/library'

const invoke = <T>(ch: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(ch, ...args) as Promise<T>

const api: VegaDesktopApi = {
  platform: process.platform,
  library: {
    folders: () => invoke(CH.folders),
    addFolder: () => invoke(CH.addFolder),
    removeFolder: (id) => invoke(CH.removeFolder, id),
    rescan: (id) => invoke(CH.rescan, id),
    search: (q, limit) => invoke(CH.search, q, limit),
    all: (limit) => invoke(CH.all, limit),
    getTrack: (id) => invoke(CH.getTrack, id),
    onScanProgress: (cb) => {
      const l = (_e: IpcRendererEvent, p: ScanProgress): void => cb(p)
      ipcRenderer.on(EV.scanProgress, l)
      return () => ipcRenderer.removeListener(EV.scanProgress, l)
    }
  },
  cache: {
    stats: () => invoke(CH.cacheStats),
    clear: () => invoke(CH.cacheClear),
    setMaxMb: (mb) => invoke(CH.cacheSetMax, mb)
  },
  kv: {
    getAll: () => invoke(CH.kvGetAll),
    set: (key, value) => invoke(CH.kvSet, key, value)
  }
}

contextBridge.exposeInMainWorld('vega', api)
