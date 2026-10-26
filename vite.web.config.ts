import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer-only dev server (no Electron): `npm run dev:web`. Handy for UI work and browser testing.
export default defineConfig({
  base: './',
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@providers': resolve(__dirname, 'src/providers'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()],
  build: { outDir: resolve(__dirname, 'dist-web'), emptyOutDir: true },
  server: { port: 5174, strictPort: true }
})
