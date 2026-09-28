import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ensureDirs } from './paths'
import { registerIpc } from './ipc'
import { setHandlers, unregisterAll } from './hotkeys'

let mainWindow: BrowserWindow | null = null

const getWindow = (): BrowserWindow | null => mainWindow

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    // Without this Windows cascade-places the window, which on first launch can
    // drop most of it below the bottom of the screen.
    center: true,
    show: false,
    frame: false,
    backgroundColor: '#08080C',
    title: 'Soundboard',
    webPreferences: {
      // .mjs, not .js: with "type": "module" electron-vite emits an ESM
      // preload, and Electron only loads one under that extension.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // The audio engine needs getUserMedia and setSinkId; both are standard
      // web APIs, no extra flags required.
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * A second instance would fight the first one over every hotkey registration,
 * so hand focus back to the window that already exists instead.
 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.andreas.soundboard')
    ensureDirs()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    setHandlers({
      trigger: (padId) => mainWindow?.webContents.send('trigger:pad', padId),
      panic: () => mainWindow?.webContents.send('trigger:panic'),
      bankSwitch: (index) => mainWindow?.webContents.send('trigger:bank', index)
    })

    registerIpc(getWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => {
    unregisterAll()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
