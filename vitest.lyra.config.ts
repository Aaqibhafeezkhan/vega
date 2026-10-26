import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Lyra's vendored tests use Lyra's own import aliases, so they run in a separate project.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'lyra/shared'),
      '@core': resolve(__dirname, 'lyra/core'),
      '@': resolve(__dirname, 'lyra/renderer/src')
    }
  },
  test: { include: ['lyra/**/*.test.ts'] }
})
