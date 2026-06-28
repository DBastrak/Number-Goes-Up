// Foxy jumpscare — a full-monitor, frameless, transparent, always-on-top, click-through
// window that plays the gif + sound over everything else, then closes itself. Separate
// from the app window so it covers the whole screen like a real overlay.

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

let scareWin = null
let safetyTimer = null

// Hard ceiling: close the window even if the renderer never reports the half-way mark.
const MAX_MS = 4000

export function showJumpscare() {
  if (scareWin) return // one at a time

  const display = screen.getPrimaryDisplay()
  const b = display.bounds // full monitor, including the taskbar area

  scareWin = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Let the gif's audio start without a user gesture inside this window.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  // Top of the stack and visible over fullscreen apps / games; never steals clicks.
  scareWin.setAlwaysOnTop(true, 'screen-saver')
  scareWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  scareWin.setIgnoreMouseEvents(true)

  if (process.env['ELECTRON_RENDERER_URL']) {
    scareWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#jumpscare')
  } else {
    scareWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'jumpscare' })
  }

  scareWin.once('ready-to-show', () => scareWin && scareWin.showInactive())
  scareWin.on('closed', () => {
    scareWin = null
  })

  clearTimeout(safetyTimer)
  safetyTimer = setTimeout(hideJumpscare, MAX_MS)
}

export function hideJumpscare() {
  clearTimeout(safetyTimer)
  safetyTimer = null
  if (scareWin) {
    scareWin.close()
    scareWin = null
  }
}
