import type { FolderInfo, ScanProgress } from './library'
import type { Track } from './types'

/** IPC contract between renderer and Electron main. Keep in sync with preload/index.ts. */
export const CH = {
  folders: 'library:folders',
  addFolder: 'library:addFolder',
  removeFolder: 'library:removeFolder',
  rescan: 'library:rescan',
  search: 'library:search',
  all: 'library:all',
  getTrack: 'library:getTrack',
  kvGetAll: 'kv:getAll',
  kvSet: 'kv:set',
  cacheStats: 'cache:stats',
  cacheClear: 'cache:clear',
  cacheSetMax: 'cache:setMax'
} as const

export const EV = {
  scanProgress: 'library:scanProgress'
} as const

export interface VegaDesktopApi {
  platform: string
  library: {
    folders(): Promise<FolderInfo[]>
    addFolder(): Promise<FolderInfo | null>
    removeFolder(id: string): Promise<void>
    rescan(id?: string): Promise<void>
    search(q: string, limit: number): Promise<Track[]>
    all(limit: number): Promise<Track[]>
    getTrack(id: string): Promise<Track | null>
    onScanProgress(cb: (p: ScanProgress) => void): () => void
  }
  cache: {
    stats(): Promise<{ bytes: number; files: number; maxBytes: number }>
    clear(): Promise<void>
    setMaxMb(mb: number): Promise<number>
  }
  kv: {
    getAll(): Promise<Record<string, string>>
    set(key: string, value: string): Promise<void>
  }
}

/** Custom protocol that serves library audio/artwork to the renderer (supports Range requests). */
export const MEDIA_SCHEME = 'vega-media'

/** Serves the packaged UI (index.html and Lyra's iframe page) from a real origin instead of file://, so the two pages can talk. */
export const APP_SCHEME = 'vega-app'
