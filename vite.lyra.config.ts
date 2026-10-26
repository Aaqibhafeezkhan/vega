import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Builds Lyra's player UI (vendored in lyra/) as a standalone page served by Vega at /lyra/ and shown in an iframe.
 * Run by `npm run build:lyra`; output goes to src/renderer/public/lyra (served as static files by every Vega build).
 */
export default defineConfig({
  root: resolve(__dirname, 'lyra'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'lyra/shared'),
      '@core': resolve(__dirname, 'lyra/core'),
      '@': resolve(__dirname, 'lyra/renderer/src')
    }
  },
  build: {
    outDir: resolve(__dirname, 'src/renderer/public/lyra'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: resolve(__dirname, 'lyra/index.html') }
  }
})
