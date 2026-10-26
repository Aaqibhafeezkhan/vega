import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { initLibrary, registerMediaScheme } from './library'

registerMediaScheme()

// Lets dev/test runs use an isolated profile: VEGA_USERDATA=<dir> npm run dev
if (process.env['VEGA_USERDATA']) app.setPath('userData', process.env['VEGA_USERDATA'])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b10',
    autoHideMenuBar: true,
    title: 'Vega',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  initLibrary()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
