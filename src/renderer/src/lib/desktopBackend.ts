import type { VegaDesktopApi } from '@shared/ipc'
import type { LibraryBackend } from '@shared/library'

/** Desktop backend: thin adapter over the preload IPC bridge (SQLite lives in the main process). */
export function createDesktopBackend(api: VegaDesktopApi): LibraryBackend {
  return {
    kind: 'desktop',
    supported: true,
    folders: () => api.library.folders(),
    addFolder: () => api.library.addFolder(),
    removeFolder: (id) => api.library.removeFolder(id),
    rescan: (id) => api.library.rescan(id),
    onScanProgress: (cb) => api.library.onScanProgress(cb),
    search: (q, limit) => api.library.search(q, limit),
    all: (limit) => api.library.all(limit),
    getTrack: (id) => api.library.getTrack(id),
    streamUrl: async (id) => `vega-media://file/${encodeURIComponent(id)}`,
    kvGetAll: () => api.kv.getAll(),
    kvSet: (key, value) => api.kv.set(key, value)
  }
}
