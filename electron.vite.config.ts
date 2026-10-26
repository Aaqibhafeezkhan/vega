import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')
const providers = resolve(__dirname, 'src/providers')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared, '@providers': providers } },
    // music-metadata is ESM-only: bundle it instead of require()-ing it at runtime
    build: { externalizeDeps: { exclude: ['music-metadata'] } }
  },
  preload: {
    resolve: { alias: { '@shared': shared, '@providers': providers } },
    build: { externalizeDeps: true }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // .env lives at the repo root; only VITE_* variables reach the client bundle
    envDir: __dirname,
    envPrefix: 'VITE_',
    resolve: { alias: { '@shared': shared, '@providers': providers, '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
