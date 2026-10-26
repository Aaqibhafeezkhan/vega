import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Serves the Vercel functions in /api during `dev:web`, so search and shelves work without `vercel dev`. */
function devApi(): Plugin {
  return {
    name: 'vega-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const m = /^\/api\/(ytm)\/(search|shelves)$/.exec(url.pathname)
        if (!m) return next()
        try {
          const mod = (await server.ssrLoadModule(`/../../api/${m[1]}/${m[2]}.ts`)) as { run: (u: URL) => Promise<{ status: number; body: unknown }> }
          const out = await mod.run(url)
          res.statusCode = out.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(out.body))
        } catch (err) {
          res.statusCode = 500
          res.end(String(err))
        }
      })
    }
  }
}

// Renderer-only dev server (no Electron): `npm run dev:web`. Handy for UI work and browser testing.
export default defineConfig({
  base: './',
  root: resolve(__dirname, 'src/renderer'),
  envDir: __dirname, // repo-root .env; only VITE_* variables reach the client bundle
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@providers': resolve(__dirname, 'src/providers'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react(), devApi()],
  build: { outDir: resolve(__dirname, 'dist-web'), emptyOutDir: true },
  server: { port: 5174, strictPort: true, fs: { allow: [__dirname] } }
})
