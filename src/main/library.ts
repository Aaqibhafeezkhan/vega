import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CH, EV, MEDIA_SCHEME } from '@shared/ipc'
import type { ScanProgress } from '@shared/library'
import { LibraryDb, rowToTrack } from './db'
import { scanFolder } from './scanner'

let db: LibraryDb
let artDir = ''
const scanning = new Set<number>()

/** Must run before app is ready: lets the renderer stream <audio> from vega-media:// with Range support. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
  ])
}

function broadcast(p: ScanProgress): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(EV.scanProgress, p)
}

async function runScan(folderId: number): Promise<void> {
  if (scanning.has(folderId)) return
  const folder = db.folderById(folderId)
  if (!folder) return
  scanning.add(folderId)
  try {
    await scanFolder(db, folderId, folder.path, artDir, broadcast)
  } finally {
    scanning.delete(folderId)
  }
}

export function initLibrary(): void {
  const data = app.getPath('userData')
  db = new LibraryDb(join(data, 'vega.db'))
  artDir = join(data, 'art')

  // vega-media://file/<trackId>  -> the audio file;  vega-media://art/<file> -> cached cover
  protocol.handle(MEDIA_SCHEME, (req) => {
    const url = new URL(req.url)
    const target = decodeURIComponent(url.pathname.replace(/^\//, ''))
    let path: string | undefined
    if (url.hostname === 'file') path = db.pathOf(target)
    else if (url.hostname === 'art' && /^[0-9a-f]+\.(jpg|png)$/.test(target)) path = join(artDir, target)
    if (!path) return new Response('not found', { status: 404 })
    // net.fetch on file:// honours Range headers, so seeking works
    return net.fetch(pathToFileURL(path).toString(), { headers: req.headers })
  })

  ipcMain.handle(CH.folders, () => db.folders())

  ipcMain.handle(CH.addFolder, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, { title: 'Add music folder', properties: ['openDirectory'] })
    const dir = res.filePaths[0]
    if (res.canceled || !dir) return null
    const { id } = db.addFolder(dir)
    void runScan(id)
    return db.folders().find((f) => f.id === String(id)) ?? null
  })

  ipcMain.handle(CH.removeFolder, (_e, id: string) => db.removeFolder(Number(id)))

  ipcMain.handle(CH.rescan, async (_e, id?: string) => {
    const ids = id ? [Number(id)] : db.folders().map((f) => Number(f.id))
    await Promise.all(ids.map(runScan))
  })

  ipcMain.handle(CH.search, (_e, q: string, limit: number) => db.search(String(q), clamp(limit)).map(rowToTrack))
  ipcMain.handle(CH.all, (_e, limit: number) => db.all(clamp(limit)).map(rowToTrack))
  ipcMain.handle(CH.getTrack, (_e, id: string) => {
    const r = db.getTrack(String(id))
    return r ? rowToTrack(r) : null
  })
  ipcMain.handle(CH.kvGetAll, () => db.kvGetAll())
  ipcMain.handle(CH.kvSet, (_e, key: string, value: string) => db.kvSet(String(key), String(value)))

  app.on('will-quit', () => db.close())
}

const clamp = (n: unknown): number => Math.min(50_000, Math.max(1, Number(n) || 100))
