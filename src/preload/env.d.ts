import type { VegaDesktopApi } from '@shared/ipc'

export {}
declare global {
  interface Window {
    /** Present only inside the Electron shell. */
    vega?: VegaDesktopApi
  }
}
