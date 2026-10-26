import { SourceRegistry } from '@shared/registry'
import { createMockProvider } from '@providers/mock'
import { createLocalProvider } from '@providers/local'
import { createAudiusProvider } from '@providers/audius'
import { createJamendoProvider } from '@providers/jamendo'
import { createArchiveProvider } from '@providers/archive'
import { createRadioProvider } from '@providers/radio'
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

/** Radio is queried directly by the Radio view (its stations are not songs), but registered for browse shelves and resolve. */
export const radio = createRadioProvider()

/** The demo catalog is a stand-in for a real library; it can be switched off once real music is added. */
export function setDemoEnabled(on: boolean): void {
  if (on) sources.register(mock, 100)
  else sources.unregister(mock.id)
}

/** Registers/unregisters online providers to match settings. Jamendo only exists once the user supplies a client id. */
export function applyOnlineSources(cfg: { audius: boolean; archive: boolean; radio: boolean; jamendoClientId: string }): void {
  if (cfg.radio) sources.register(radio, 70)
  else sources.unregister('radio')
  if (cfg.archive) sources.register(createArchiveProvider(), 55)
  else sources.unregister('archive')
  if (cfg.audius) sources.register(createAudiusProvider(), 50)
  else sources.unregister('audius')
  if (cfg.jamendoClientId) sources.register(createJamendoProvider({ clientId: cfg.jamendoClientId }), 60)
  else sources.unregister('jamendo')
}
