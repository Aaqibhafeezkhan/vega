// Entry of Lyra's player page inside Vega: install `window.lyra` first, then start Lyra's own React app unchanged.
import { ready } from './api'

await ready
document.documentElement.dataset.platform = 'web'
await import('../renderer/src/main')
