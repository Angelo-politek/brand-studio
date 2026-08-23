import { app, shell, BrowserWindow, session, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerMediaScheme, handleMediaProtocol } from './storage/protocol'
import { ensureDataDirs, getPaths } from './storage/paths'
import { initDb, closeDb } from './db'
import { registerIpc } from './ipc'
import { startPython, stopPython } from './python/manager'
import { logger, installGlobalErrorHandlers } from './logger'

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
        `connect-src 'self' media: ${sidecar} ws://localhost:* http://localhost:*`,
        "media-src 'self' media: blob:"
      ].join('; ')
    : [
        "default-src 'self'",
        // Konva/React build needs inline styles; no eval in prod.
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' media: data: blob:`,
        `font-src 'self' media: data:`,
        `connect-src 'self' media: ${sidecar}`,
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.brandstudio.app')

  installGlobalErrorHandlers()
  logger.info('app ready')
  ensureDataDirs()

  try {
    await initDb()
  } catch (err) {
    // A failed migration (corrupt DB, file locked by another instance, …) must
    // never leave the user with a silent ghost process and no window. Tell them
    // where to look, then quit cleanly instead of propagating the exception.
    logger.error('initDb failed — quitting', err)
    const message = err instanceof Error ? err.message : String(err)
    let paths = { database: 'userData/data/database', logs: 'userData/logs' }
    try {
      const p = getPaths()
      paths = { database: p.database, logs: join(app.getPath('userData'), 'logs') }
    } catch {
      /* getPaths itself failed; fall back to the generic hint above */
    }
    dialog.showErrorBox(
      'Brand Studio failed to start',
      `The local database could not be opened or upgraded.\n\n${message}\n\n` +
        `Database folder: ${paths.database}\nLog file: ${join(paths.logs, 'main.log')}\n\n` +
        'If another Brand Studio window is already open, close it and try again. ' +
        'If the problem persists, back up and remove the database folder above to reset the app.'
    )
    app.quit()
    return
  }

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
