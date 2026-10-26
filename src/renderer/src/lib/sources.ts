import { SourceRegistry } from '@shared/registry'
import { createMockProvider, MOCK_CATALOG } from '@providers/mock'

/**
 * The app-wide source registry. M1 registers only the demo provider; local files (M2) and online
 * providers (M3) register here with a lower priority number so real sources win ties in dedupe.
 */
export const sources = new SourceRegistry({
  onProviderError: (id, err) => console.warn(`[source:${id}]`, err)
})
sources.register(createMockProvider(), 100)

/** Everything the app can browse offline right now (used by recommendations). */
export const catalog = MOCK_CATALOG
