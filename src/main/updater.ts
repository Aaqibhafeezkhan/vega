import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { UPDATE_CH, type UpdateState } from '@shared/ipc'

const CHECK_EVERY_MS = 4 * 3600_000

let state: UpdateState = { state: 'idle' }

function set(next: UpdateState): void {
  state = next
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(UPDATE_CH.state, state)
}

/**
 * Auto-update from the project's GitHub releases (electron-updater reads latest.yml next to the installer).
 * Downloads in the background, installs when the app quits (or on "Restart to update"). Only for the installed app.
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
  autoUpdater.autoInstallOnAppQuit = true
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
  ipcMain.handle(UPDATE_CH.install, () => {
    if (state.state === 'ready') autoUpdater.quitAndInstall(true, true)
  })

  setTimeout(() => getAuto() && void check(), 10_000)
  setInterval(() => getAuto() && void check(), CHECK_EVERY_MS)
}
