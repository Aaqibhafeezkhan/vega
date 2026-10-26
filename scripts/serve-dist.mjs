// Serves dist-web with the headers from vercel.json, to check the Content-Security-Policy before deploying.
// Usage: npm run build:web && node scripts/serve-dist.mjs [port]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dist = join(root, 'dist-web')
const cfg = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'))
const globalHeaders = Object.fromEntries(cfg.headers[0].headers.map((h) => [h.key, h.value]))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' }

createServer(async (req, res) => {
  const path = normalize(new URL(req.url, 'http://x').pathname).replace(/^([/\\])+/, '') || 'index.html'
  try {
    const body = await readFile(join(dist, path))
    res.writeHead(200, { ...globalHeaders, 'Content-Type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(Number(process.argv[2] ?? 5180), '127.0.0.1', () => console.log('serving dist-web on', process.argv[2] ?? 5180))
