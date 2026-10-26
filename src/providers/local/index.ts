import type { LibraryBackend } from '@shared/library'
import type { SourceProvider } from '@shared/provider'

/** Plays the user's own files. All storage details live behind LibraryBackend (SQLite on desktop, IndexedDB on web). */
export function createLocalProvider(backend: LibraryBackend): SourceProvider {
  return {
    id: 'local',
    name: 'My music',
    capabilities: { search: true, browse: false, download: false, needsKey: false },
    async health() {
      return backend.supported ? 'ok' : 'down'
    },
    async search(q, opts) {
      return { tracks: await backend.search(q, opts.limit) }
    },
    getTrack: (id) => backend.getTrack(id),
    async resolve(id) {
      return { kind: 'url', url: await backend.streamUrl(id) }
    }
  }
}
