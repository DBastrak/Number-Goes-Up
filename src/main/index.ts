import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, extname } from 'path'
import { writeFileSync, readFileSync, rmSync, copyFileSync, existsSync, statSync } from 'fs'
import { loadEnv } from './env'
import { lookupGuardian } from './bungie'
import {
  loadAllActivities,
  getPostGameCarnageReport,
  enrichActivities,
  getUserStats,
  getUserBreakdown,
  getRecentCompletions,
  getFullClearCount
} from './stats'
import { getLiveActivity } from './live'
import {
  getDisplays,
  showOverlay,
  hideOverlay,
  moveOverlay,
  setOverlayLocked,
  setOverlayIgnoreMouse,
  setOverlayAlign,
  sendOverlayTheme,
  setOverlayPersist
} from './overlay'
import { showJumpscare, hideJumpscare } from './jumpscare'
import { autoUpdater } from 'electron-updater'

// The main window, kept so the auto-updater can message the renderer.
let mainWin = null

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1536,
    height: 984,
    minWidth: 940,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b2838',
    title: 'number go up',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Closing the main window also closes the overlay + any jumpscare so the app can quit.
  mainWindow.on('closed', () => {
    hideOverlay()
    hideJumpscare()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL during dev
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWin = mainWindow
  return mainWindow
}

// Auto-update: check GitHub Releases on launch (+ every 6h), download in the background,
// and tell the renderer once an update is staged so it can offer "Restart to update".
// Only the packaged build can self-update, so this is a no-op in dev.
function setupAutoUpdate() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    mainWin?.webContents.send('update:downloaded', { version: info.version })
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err?.message || err)
  })

  const check = () => autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed:', e?.message))
  check()
  setInterval(check, 6 * 60 * 60 * 1000)
}

// The session resolved at login; also persisted to disk so later runs can reuse it.
let currentSession = null

function saveSession(session) {
  try {
    const file = join(app.getPath('userData'), 'session.json')
    writeFileSync(file, JSON.stringify(session, null, 2))
    return file
  } catch (err) {
    console.error('Failed to save session:', err)
    return null
  }
}

function readSession() {
  if (currentSession) return currentSession
  try {
    return JSON.parse(readFileSync(join(app.getPath('userData'), 'session.json'), 'utf8'))
  } catch {
    return null
  }
}

// Following list — other accounts you track. Persisted as [{ name, membershipType, membershipId }].
function followingPath() {
  return join(app.getPath('userData'), 'following.json')
}
function readFollowing() {
  try {
    const list = JSON.parse(readFileSync(followingPath(), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function saveFollowing(list) {
  try {
    writeFileSync(followingPath(), JSON.stringify(list, null, 2))
  } catch (err) {
    console.error('Failed to save following list:', err)
  }
}

// Overlay-timer config persisted so it restores on launch.
//   { enabled, displayId, x, y, locked }
// x/y are the dragged absolute position (null = default top-left corner of displayId).
// locked toggles between click-through readout and a draggable/interactive overlay.
const OVERLAY_DEFAULTS = {
  enabled: false,
  displayId: null,
  x: null,
  y: null,
  locked: true,
  align: 'auto' // 'auto' (by screen side) | 'left' | 'center' | 'right'
}
function overlayConfigPath() {
  return join(app.getPath('userData'), 'overlay.json')
}
function readOverlayConfig() {
  try {
    return { ...OVERLAY_DEFAULTS, ...JSON.parse(readFileSync(overlayConfigPath(), 'utf8')) }
  } catch {
    return { ...OVERLAY_DEFAULTS }
  }
}
function saveOverlayConfig(cfg) {
  try {
    writeFileSync(overlayConfigPath(), JSON.stringify(cfg, null, 2))
  } catch (err) {
    console.error('Failed to save overlay config:', err)
  }
}

// Wallpaper custom background — the user-chosen image/gif is copied into userData and its
// choice persisted as { type, file, name }. The renderer can't load arbitrary local
// files (origin/CSP), so we hand it a data: URL instead (CSP allows img-src data:).
const WALLPAPER_MAX_BYTES = 30 * 1024 * 1024
const WALLPAPER_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
}
function wallpaperConfigPath() {
  return join(app.getPath('userData'), 'wallpaper-bg.json')
}
function readWallpaperConfig() {
  try {
    return JSON.parse(readFileSync(wallpaperConfigPath(), 'utf8'))
  } catch {
    return { type: 'default', file: null, name: null }
  }
}
function saveWallpaperConfig(cfg) {
  try {
    writeFileSync(wallpaperConfigPath(), JSON.stringify(cfg, null, 2))
  } catch (err) {
    console.error('Failed to save wallpaper config:', err)
  }
}
function wallpaperDataUrl() {
  const cfg = readWallpaperConfig()
  if (cfg.type !== 'custom' || !cfg.file || !existsSync(cfg.file)) return null
  try {
    const mime = WALLPAPER_MIME[extname(cfg.file).toLowerCase()] || 'application/octet-stream'
    return `data:${mime};base64,${readFileSync(cfg.file).toString('base64')}`
  } catch (err) {
    console.error('Failed to read wallpaper background:', err)
    return null
  }
}

app.whenReady().then(() => {
  // Load the Bungie API key from .env (checks the app dir and cwd).
  // In a packaged build the .env is shipped to the resources dir (see electron-builder.yml).
  const envFile = loadEnv([process.resourcesPath, app.getAppPath(), process.cwd()])
  console.log('[main] .env loaded from:', envFile, '| bungieAPI set:', !!process.env.bungieAPI)

  // Frameless-window controls driven by the custom in-app title bar.
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // App version (from package.json), shown in Settings.
  ipcMain.handle('get-app-version', () => app.getVersion())

  // Return the saved session (for auto-restore on launch), or null.
  ipcMain.handle('get-session', () => readSession())

  // Sign out: forget the saved account so the next launch shows the login screen.
  ipcMain.handle('logout', () => {
    currentSession = null
    try {
      rmSync(join(app.getPath('userData'), 'session.json'), { force: true })
    } catch (err) {
      console.error('Failed to clear session:', err)
    }
    return { ok: true }
  })

  // Login: run the 3-step Bungie lookup, then save the session on success.
  ipcMain.handle('login', async (_event, username) => {
    console.log('[main] login IPC received for:', JSON.stringify(username))
    const result = await lookupGuardian(username)
    if (result.ok) {
      currentSession = result.session
      const path = saveSession(result.session)
      ;(result as any).savedTo = path
    }
    return result
  })

  // Load all raid + dungeon activities for the logged-in account.
  ipcMain.handle('load-activities', async () => {
    const session = readSession()
    if (!session) return { ok: false, error: 'No session — please log in first.' }
    try {
      const data = await loadAllActivities(session)

      // Enrich completed activities with PGCR-derived fields, reusing a disk cache.
      const cacheFile = join(app.getPath('userData'), 'pgcr-cache-v2.json')
      let cache = {}
      try {
        cache = JSON.parse(readFileSync(cacheFile, 'utf8'))
      } catch {
        cache = {}
      }
      const enriched = await enrichActivities(data.activities, cache)
      writeFileSync(cacheFile, JSON.stringify(cache))

      const file = join(app.getPath('userData'), 'activities.json')
      writeFileSync(file, JSON.stringify(data, null, 2))
      console.log(
        '[main] loaded', data.activities.length, 'activities | PGCR enriched',
        enriched.fetched, 'new,', enriched.failed, 'failed /', enriched.total,
        'completed -> saved to', file
      )
      return { ok: true, ...data }
    } catch (err) {
      console.error('[main] load-activities failed:', err)
      return { ok: false, error: err.message }
    }
  })

  // Fetch a single activity's Post Game Carnage Report (full per-player stats).
  ipcMain.handle('get-pgcr', async (_event, instanceId) => {
    try {
      const pgcr = await getPostGameCarnageReport(instanceId)
      return { ok: true, pgcr }
    } catch (err) {
      console.error('[main] get-pgcr failed:', err)
      return { ok: false, error: err.message }
    }
  })

  // Live activity: is the player currently in an activity, and what / with whom.
  ipcMain.handle('get-live-activity', async () => {
    const session = readSession()
    if (!session) return { ok: false, error: 'No session — please log in first.' }
    try {
      return await getLiveActivity(session)
    } catch (err) {
      console.error('[main] get-live-activity failed:', err)
      return { ok: false, error: err.message }
    }
  })

  // --- Overlay timer ---
  // Write dragged positions from the overlay window back to disk.
  setOverlayPersist((pos) => {
    saveOverlayConfig({ ...readOverlayConfig(), x: pos.x, y: pos.y })
  })

  ipcMain.handle('get-displays', () => getDisplays())
  ipcMain.handle('get-overlay-config', () => readOverlayConfig())
  ipcMain.handle('set-overlay', (_event, cfg) => {
    const next = {
      ...readOverlayConfig(),
      enabled: !!cfg?.enabled,
      displayId: cfg?.displayId ?? readOverlayConfig().displayId
    }
    saveOverlayConfig(next)
    if (next.enabled) showOverlay(next)
    else hideOverlay()
    return { ok: true, ...next }
  })
  ipcMain.handle('move-overlay', (_event, displayId) => {
    // An explicit monitor change resets to that display's default corner.
    const next = { ...readOverlayConfig(), displayId, x: null, y: null }
    saveOverlayConfig(next)
    moveOverlay(next)
    return { ok: true }
  })
  // Pin toggle: flip locked, persist it, and apply to the live window.
  ipcMain.handle('overlay:toggle-lock', () => {
    const cfg = readOverlayConfig()
    const locked = setOverlayLocked(!cfg.locked)
    saveOverlayConfig({ ...cfg, locked })
    return { locked }
  })
  // Hotspot capture so the pin stays clickable while the overlay is click-through.
  ipcMain.on('overlay:set-ignore-mouse', (_event, ignore) => setOverlayIgnoreMouse(ignore))
  // Main window asks the overlay to re-apply the theme after a colour/wallpaper change.
  ipcMain.on('overlay:refresh-theme', () => sendOverlayTheme())
  // Timer text alignment (auto | left | center | right), persisted + pushed to the overlay.
  ipcMain.handle('overlay:set-align', (_event, align) => {
    const next = ['auto', 'left', 'center', 'right'].includes(align) ? align : 'auto'
    saveOverlayConfig({ ...readOverlayConfig(), align: next })
    setOverlayAlign(next)
    return { align: next }
  })

  // Full raid + dungeon clears completed so far today (local date) — checkpoint runs are
  // excluded. Used by the overlay and top-bar counter; recomputed live so it updates after
  // activities complete.
  ipcMain.handle('get-today-clears', async () => {
    const session = readSession()
    if (!session) return { ok: false, error: 'No session — please log in first.' }
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const count = await getFullClearCount(
        session.membershipType,
        session.primaryMembershipId,
        start.toISOString()
      )
      return { ok: true, count }
    } catch (err) {
      console.error('[main] get-today-clears failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // --- Wallpaper custom background ---
  // Current background as a data URL (or default).
  ipcMain.handle('wallpaper:get', () => {
    const dataUrl = wallpaperDataUrl()
    const cfg = readWallpaperConfig()
    return dataUrl ? { type: 'custom', dataUrl, name: cfg.name } : { type: 'default' }
  })

  // Browse for an image/gif, copy it into userData, and return it as a data URL.
  ipcMain.handle('wallpaper:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [
        { name: 'Images & GIFs', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'avif'] }
      ]
    })
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true }

    const src = result.filePaths[0]
    const ext = extname(src).toLowerCase()
    if (!WALLPAPER_MIME[ext]) return { ok: false, error: 'Unsupported image type.' }
    try {
      if (statSync(src).size > WALLPAPER_MAX_BYTES) {
        return { ok: false, error: 'Image is too large (max 30 MB).' }
      }
      // Unique filename per pick so the path always changes — defeats any path-based
      // caching/locking that could leave the old image showing after a re-pick.
      const dest = join(app.getPath('userData'), `wallpaper-bg-${Date.now()}${ext}`)
      const prev = readWallpaperConfig()
      if (prev.file && existsSync(prev.file)) {
        try {
          rmSync(prev.file, { force: true })
        } catch {
          /* ignore */
        }
      }
      copyFileSync(src, dest)
      const name = src.split(/[\\/]/).pop()
      saveWallpaperConfig({ type: 'custom', file: dest, name })
      return { ok: true, dataUrl: wallpaperDataUrl(), name }
    } catch (err) {
      console.error('Failed to set wallpaper background:', err)
      return { ok: false, error: err.message }
    }
  })

  // Forget the custom image and fall back to the bundled cat gif.
  ipcMain.handle('wallpaper:reset', () => {
    const cfg = readWallpaperConfig()
    if (cfg.file && existsSync(cfg.file)) {
      try {
        rmSync(cfg.file, { force: true })
      } catch {
        /* ignore */
      }
    }
    saveWallpaperConfig({ type: 'default', file: null, name: null })
    return { ok: true }
  })

  // --- Foxy jumpscare (full-screen overlay window) ---
  ipcMain.on('jumpscare:show', () => showJumpscare())
  ipcMain.on('jumpscare:done', () => hideJumpscare())

  // --- Following (other tracked accounts) ---
  ipcMain.handle('following:list', () => readFollowing())

  ipcMain.handle('following:add', async (_event, username) => {
    const result = await lookupGuardian(username)
    if (!result.ok) return result
    const entry = {
      name: result.session.displayName,
      membershipType: result.session.membershipType,
      membershipId: result.session.primaryMembershipId
    }
    const list = readFollowing()
    if (list.some((u) => u.membershipId === entry.membershipId)) {
      return { ok: false, error: 'Already following this Guardian.' }
    }
    list.push(entry)
    saveFollowing(list)
    return { ok: true, entry }
  })

  ipcMain.handle('following:remove', (_event, membershipId) => {
    saveFollowing(readFollowing().filter((u) => u.membershipId !== membershipId))
    return { ok: true }
  })

  ipcMain.handle('following:stats', async (_event, membershipType, membershipId) => {
    try {
      const stats = await getUserStats(membershipType, membershipId)
      return { ok: true, ...stats }
    } catch (err) {
      console.error('[main] following:stats failed:', err.message)
      return { ok: false, error: err.message, private: err.code === 'PRIVATE' }
    }
  })

  ipcMain.handle('following:breakdown', async (_event, membershipType, membershipId) => {
    try {
      const data = await getUserBreakdown(membershipType, membershipId)
      return { ok: true, ...data }
    } catch (err) {
      console.error('[main] following:breakdown failed:', err.message)
      return { ok: false, error: err.message, private: err.code === 'PRIVATE' }
    }
  })

  // New clears across all followed users since `sinceISO` (the renderer passes the app
  // launch time, or the time the user last cleared notifications).
  ipcMain.handle('following:new-clears', async (_event, sinceISO) => {
    const list = readFollowing()
    const items = []
    for (const u of list) {
      try {
        const clears = await getRecentCompletions(u.membershipType, u.membershipId, sinceISO)
        for (const c of clears) {
          items.push({ user: u.name, membershipId: u.membershipId, ...c })
        }
      } catch (err) {
        console.error('[main] new-clears failed for', u.name, err.message)
      }
    }
    items.sort((a, b) => b.period.localeCompare(a.period))
    return { ok: true, items, count: items.length }
  })

  // Quit and install a downloaded update (triggered by the in-app "Restart" button).
  ipcMain.on('update:restart', () => autoUpdater.quitAndInstall())

  createWindow()
  setupAutoUpdate()

  // Restore the overlay if it was enabled last session.
  const overlayCfg = readOverlayConfig()
  if (overlayCfg.enabled) showOverlay(overlayCfg)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
