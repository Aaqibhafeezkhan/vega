import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { UPDATE_CH, type UpdateState } from '@shared/ipc'

const CHECK_EVERY_MS = 4 * 3600_000

let state: UpdateState = { state: 'idle' }
let installing = false

const SPLASH = (v: string): string =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;gap:16px;background:#0b0c14;color:#f6f3ec;font:600 15px system-ui,sans-serif;border:1px solid #2a2c3a;box-sizing:border-box">
<style>i{width:22px;height:22px;border-radius:50%;border:3px solid #ffffff30;border-top-color:#ff7a1a;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>
<i></i><div>Updating Vega${v ? ' to ' + v : ''}…<div style="font-weight:400;font-size:12px;opacity:.6;margin-top:4px">It will be ready in a moment</div></div></body>`)

/** Closes the app into the installer: an "Updating" window first, then the installer (with its own progress) so the app is never silently missing. */
function installNow(): void {
  if (installing || state.state !== 'ready') return
  installing = true
  const splash = new BrowserWindow({ width: 380, height: 120, frame: false, resizable: false, alwaysOnTop: true, show: false, backgroundColor: '#0b0c14', webPreferences: { sandbox: true } })
  splash.once('ready-to-show', () => splash.show())
  void splash.loadURL(SPLASH(state.version ?? ''))
  for (const w of BrowserWindow.getAllWindows()) if (w !== splash) w.destroy()
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 1200)
}

function set(next: UpdateState): void {
  state = next
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(UPDATE_CH.state, state)
}

/**
 * Auto-update from the project's GitHub releases (electron-updater reads latest.yml next to the installer).
 * Downloads in the background; on quit (or "Restart to update") an Updating window shows while the installer runs, then the app reopens updated. Only for the installed app.
 */
export function initUpdater(getAuto: () => boolean): void {
  ipcMain.handle(UPDATE_CH.get, () => state)
  ipcMain.handle(UPDATE_CH.info, () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }))

  if (!app.isPackaged) {
    state = { state: 'disabled', message: 'Updates are only available in the installed app.' }
    ipcMain.handle(UPDATE_CH.check, () => undefined)
    ipcMain.handle(UPDATE_CH.install, () => undefined)
    return
  }

  autoUpdater.autoDownload = true
  // Installing silently after exit left a window where the app was missing (reopening mid-install: "app not found").
  // Instead we hold the quit, show our own "Updating" window, then run the installer with its progress window visible.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: state.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => set({ state: 'error', message: e?.message?.split('\n')[0]?.slice(0, 160) ?? 'Update check failed' }))

  const check = async (): Promise<void> => {
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* reported through the error event */
    }
  }
  ipcMain.handle(UPDATE_CH.check, check)
  ipcMain.handle(UPDATE_CH.install, () => installNow())

  app.on('before-quit', (e) => {
    if (installing || state.state !== 'ready') return
    e.preventDefault()
    installNow()
  })

  setTimeout(() => getAuto() && void check(), 10_000)
  setInterval(() => getAuto() && void check(), CHECK_EVERY_MS)
}
