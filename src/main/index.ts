import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerMediaScheme, handleMediaProtocol } from './storage/protocol'
import { ensureDataDirs } from './storage/paths'
import { initDb, closeDb } from './db'
import { registerIpc } from './ipc'
import { startPython, stopPython } from './python/manager'

// Custom scheme must be registered before the app is ready.
registerMediaScheme()

/**
 * Attach a Content-Security-Policy to every document response. Locks the
 * renderer to its own bundle plus the local media:// scheme and the localhost
 * sidecar. In dev we relax it for Vite HMR (inline/eval + websocket).
 */
function applyCsp(): void {
  const sidecar = 'http://127.0.0.1:*'
  const policy = is.dev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' media: data: blob:`,
        `font-src 'self' media: data:`,
        `connect-src 'self' ${sidecar} ws://localhost:* http://localhost:*`,
        "media-src 'self' media: blob:"
      ].join('; ')
    : [
        "default-src 'self'",
        // Konva/React build needs inline styles; no eval in prod.
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' media: data: blob:`,
        `font-src 'self' media: data:`,
        `connect-src 'self' ${sidecar}`,
        "media-src 'self' media: blob:",
        "object-src 'none'",
        "base-uri 'self'"
      ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    title: 'Brand Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Surface renderer warnings/errors in the main console (useful in dev).
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.brandstudio.app')

  ensureDataDirs()
  initDb()
  applyCsp()
  handleMediaProtocol()
  registerIpc()
  // Fire-and-forget: app remains usable while the sidecar warms up.
  void startPython()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopPython()
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPython()
    app.quit()
  }
})
