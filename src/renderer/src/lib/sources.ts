import { SourceRegistry } from '@shared/registry'
import { createMockProvider } from '@providers/mock'
import { createLocalProvider } from '@providers/local'
import { backend } from './backend'

/**
 * The app-wide source registry. Lower priority number wins dedupe ties, so the user's own files beat everything.
 * Online providers (M3) register here too.
 */
export const sources = new SourceRegistry({
  onProviderError: (id, err) => console.warn(`[source:${id}]`, err)
})

sources.register(createLocalProvider(backend), 10)

const mock = createMockProvider()

/** The demo catalog is a stand-in for a real library; it can be switched off once real music is added. */
export function setDemoEnabled(on: boolean): void {
  if (on) sources.register(mock, 100)
  else sources.unregister(mock.id)
}
