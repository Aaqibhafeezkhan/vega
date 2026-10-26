// Downloads the official yt-dlp release for the build platform into resources/bin (bundled into the installer).
// Verified against the release's SHA2-256SUMS. Windows uses the onedir zip (starts ~5x faster than the one-file exe).
// Usage: node scripts/fetch-ytdlp.mjs   (run automatically by `npm run dist`; skipped when already present)
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'resources', 'bin')
const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const platform = process.platform
const asset = platform === 'win32' ? 'yt-dlp_win.zip' : platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp'
const marker = platform === 'win32' ? join(out, 'yt-dlp', 'yt-dlp.exe') : join(out, asset)

if (existsSync(marker) && !process.argv.includes('--force')) {
  console.log('yt-dlp already present:', marker)
  process.exit(0)
}

const get = async (u) => {
  const r = await fetch(u, { redirect: 'follow' })
  if (!r.ok) throw new Error(`${u} -> ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

const [data, sums] = await Promise.all([get(`${base}/${asset}`), get(`${base}/SHA2-256SUMS`)])
const expected = sums.toString().split('\n').map((l) => l.trim().split(/\s+/)).find(([, f]) => f?.replace(/^\*/, '') === asset)?.[0]
const actual = createHash('sha256').update(data).digest('hex')
if (!expected || expected.toLowerCase() !== actual) throw new Error(`checksum mismatch for ${asset}; refusing to bundle`)

mkdirSync(out, { recursive: true })
if (platform === 'win32') {
  const dir = join(out, 'yt-dlp')
  rmSync(dir, { recursive: true, force: true })
  for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(data)))) {
    if (name.endsWith('/')) continue
    const dest = join(dir, name)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)
  }
} else {
  writeFileSync(marker, data)
  chmodSync(marker, 0o755)
}
console.log('bundled yt-dlp', asset, 'sha256 ok')
