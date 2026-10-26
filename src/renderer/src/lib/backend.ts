import type { LibraryBackend } from '@shared/library'
import { createDesktopBackend } from './desktopBackend'
import { createWebBackend } from './webBackend'

/** Desktop (Electron preload present) or web (browser) library backend. Same interface either way. */
export const backend: LibraryBackend = window.vega ? createDesktopBackend(window.vega) : createWebBackend()
