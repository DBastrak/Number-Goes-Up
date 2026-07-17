// Always-on-top timer overlay — a small frameless, transparent window that stays above
// other apps (incl. most games). It has two states, toggled by the in-overlay pin:
//   locked   (default) — click-through; sits there as a readout. Only the pin stays
//                        clickable (via a forwarded-mouse hotspot) so you can unlock it.
//   unlocked          — interactive + draggable; move it anywhere, position is saved.

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'

let overlayWin = null
let locked = true // start pinned/click-through
let customPos = null // { x, y } absolute screen coords, or null = default corner
let persistFn = null // called with { x, y } after the user drags the overlay
let suppressMove = false // ignore the `move` event during programmatic positioning
let moveTimer = null

const OVERLAY_W = 360
const OVERLAY_H = 124
const MARGIN = 16

type OverlayCfg = {
  displayId?: number | null
  x?: number | null
  y?: number | null
  locked?: boolean
  destinyOnly?: boolean
}

// --- "Only while Destiny 2 is focused" gating -------------------------------------
// A persistent hidden PowerShell child polls the foreground window's process name once
// a second (Win32 GetForegroundWindow — no native node modules needed). While the gate
// is on, the overlay window is hidden unless that name is destiny2.

let destinyOnly = false
let gameFocused = true
let watchProc = null

// Note: if the app is killed hard, the child self-terminates on its next WriteLine
// (broken stdout pipe -> unhandled IOException ends the loop).
const FOCUS_SCRIPT = [
  "$def='using System;using System.Runtime.InteropServices;public class FG{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);}'",
  'Add-Type -TypeDefinition $def',
  'while($true){',
  '$h=[FG]::GetForegroundWindow();$p=0;[void][FG]::GetWindowThreadProcessId($h,[ref]$p)',
  "$n=''",
  'try{$n=(Get-Process -Id $p -ErrorAction Stop).ProcessName}catch{}',
  '[Console]::Out.WriteLine($n)',
  'Start-Sleep -Milliseconds 1000',
  '}'
].join('\n')

// Show or hide the (existing) overlay window per the gate + current focus.
function applyVisibility() {
  if (!overlayWin) return
  const visible = !destinyOnly || gameFocused
  if (visible && !overlayWin.isVisible()) overlayWin.showInactive()
  else if (!visible && overlayWin.isVisible()) overlayWin.hide()
}

function startFocusWatch() {
  if (watchProc) return
  if (process.platform !== 'win32') {
    // No watcher available — fail open so the overlay still shows.
    gameFocused = true
    return
  }
  gameFocused = false // assume not in-game until the first report says otherwise
  try {
    watchProc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', FOCUS_SCRIPT],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    let buf = ''
    watchProc.stdout.on('data', (chunk) => {
      buf += chunk.toString()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim().toLowerCase()
        buf = buf.slice(nl + 1)
        if (!line) continue // transient lookup failure — keep the last known state
        const focused = line === 'destiny2'
        if (focused !== gameFocused) {
          gameFocused = focused
          applyVisibility()
        }
      }
    })
    watchProc.on('exit', () => {
      watchProc = null
    })
  } catch (err) {
    console.error('[overlay] focus watcher failed to start:', err)
    watchProc = null
    gameFocused = true // fail open
  }
}

function stopFocusWatch() {
  if (watchProc) {
    try {
      watchProc.kill()
    } catch {
      /* already gone */
    }
    watchProc = null
  }
  gameFocused = true
}

// Turn the gate on/off (persisted setting). Applies immediately to a live overlay.
export function setOverlayDestinyOnly(next) {
  destinyOnly = !!next
  if (destinyOnly && overlayWin) startFocusWatch()
  else stopFocusWatch()
  applyVisibility()
}
// ----------------------------------------------------------------------------------

// index.ts wires this up so dragged positions are written back to overlay.json.
export function setOverlayPersist(fn) {
  persistFn = fn
}

export function getDisplays() {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label && d.label !== '' ? d.label : `Display ${i + 1}`,
    primary: d.id === primaryId,
    width: d.size.width,
    height: d.size.height
  }))
}

function targetDisplay(displayId) {
  const displays = screen.getAllDisplays()
  return displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay()
}

// Keep the overlay fully on-screen within a display's work area.
function clampToDisplay(d, x, y) {
  const area = d.workArea
  return {
    x: Math.min(Math.max(x, area.x), area.x + area.width - OVERLAY_W),
    y: Math.min(Math.max(y, area.y), area.y + area.height - OVERLAY_H)
  }
}

function setBoundsSuppressed(x, y) {
  suppressMove = true
  overlayWin.setBounds({ x, y, width: OVERLAY_W, height: OVERLAY_H })
  suppressMove = false
}

// Tell the renderer which half of its monitor the overlay sits on, so it can align the
// text toward the nearer screen edge. Only sends on an actual change (or when forced,
// e.g. right after the page loads) to avoid chatter during a drag.
let lastSide: 'left' | 'right' | null = null
function sendSide(force = false) {
  if (!overlayWin) return
  const b = overlayWin.getBounds()
  const d = screen.getDisplayNearestPoint({
    x: b.x + Math.floor(b.width / 2),
    y: b.y + Math.floor(b.height / 2)
  })
  const side = b.x + b.width / 2 < d.workArea.x + d.workArea.width / 2 ? 'left' : 'right'
  if (force || side !== lastSide) {
    lastSide = side
    overlayWin.webContents.send('overlay:side', side)
  }
}

function positionOverlay(displayId) {
  if (!overlayWin) return
  if (customPos) {
    // A dragged position is absolute — keep it on whatever monitor it landed on.
    const d = screen.getDisplayNearestPoint({ x: customPos.x, y: customPos.y })
    const { x, y } = clampToDisplay(d, customPos.x, customPos.y)
    setBoundsSuppressed(x, y)
  } else {
    const d = targetDisplay(displayId)
    setBoundsSuppressed(d.workArea.x + MARGIN, d.workArea.y + MARGIN)
  }
  sendSide()
}

// Apply the current lock state to the window + tell the renderer so it can style the pin.
function applyLock() {
  if (!overlayWin) return
  if (locked) {
    // Click-through, but forward mouse-move so the renderer can re-enable hits over the pin.
    overlayWin.setIgnoreMouseEvents(true, { forward: true })
    overlayWin.setFocusable(false)
    overlayWin.setMovable(false)
  } else {
    overlayWin.setIgnoreMouseEvents(false)
    overlayWin.setFocusable(true)
    overlayWin.setMovable(true)
  }
  overlayWin.webContents.send('overlay:locked', locked)
}

export function showOverlay(cfg: OverlayCfg = {}) {
  const displayId = cfg.displayId ?? null
  customPos = cfg.x != null && cfg.y != null ? { x: cfg.x, y: cfg.y } : null
  if (typeof cfg.locked === 'boolean') locked = cfg.locked
  if (typeof cfg.destinyOnly === 'boolean') destinyOnly = cfg.destinyOnly

  if (!overlayWin) {
    overlayWin = new BrowserWindow({
      width: OVERLAY_W,
      height: OVERLAY_H,
      frame: false,
      transparent: true,
      resizable: false,
      movable: !locked,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      focusable: !locked,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        devTools: !app.isPackaged
      }
    })
    // Highest practical stacking level + visible across spaces / over fullscreen.
    overlayWin.setAlwaysOnTop(true, 'screen-saver')
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (process.env['ELECTRON_RENDERER_URL']) {
      overlayWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#overlay')
    } else {
      overlayWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
    }

    // Persist the position after a drag. Windows fires `move` (repeatedly) rather than
    // `moved`, so debounce until the drag settles.
    overlayWin.on('move', () => {
      if (suppressMove || !overlayWin) return
      sendSide() // flip text alignment live as it crosses the screen midpoint
      if (moveTimer) clearTimeout(moveTimer)
      moveTimer = setTimeout(() => {
        if (!overlayWin) return
        const [x, y] = overlayWin.getPosition()
        customPos = { x, y }
        persistFn?.({ x, y })
      }, 250)
    })

    // The lock state + side must reach the renderer once it has actually loaded.
    overlayWin.webContents.on('did-finish-load', () => {
      overlayWin?.webContents.send('overlay:locked', locked)
      sendSide(true)
    })

    overlayWin.on('closed', () => {
      overlayWin = null
      stopFocusWatch()
    })
  }
  positionOverlay(displayId)
  applyLock()
  overlayWin.showInactive()
  // With the gate on, start hidden until Destiny reports as the foreground window.
  if (destinyOnly) startFocusWatch()
  else stopFocusWatch()
  applyVisibility()
}

export function hideOverlay() {
  stopFocusWatch()
  if (overlayWin) {
    overlayWin.close()
    overlayWin = null
  }
}

export function moveOverlay(cfg: OverlayCfg = {}) {
  if (!overlayWin) return
  customPos = cfg.x != null && cfg.y != null ? { x: cfg.x, y: cfg.y } : null
  positionOverlay(cfg.displayId ?? null)
}

// Toggle (or set) the locked state. Returns the resulting state.
export function setOverlayLocked(next) {
  locked = typeof next === 'boolean' ? next : !locked
  applyLock()
  return locked
}

// While locked the window is click-through; the renderer calls this to momentarily
// capture the mouse so the pin hotspot is clickable, then release it again.
export function setOverlayIgnoreMouse(ignore) {
  if (overlayWin && locked) overlayWin.setIgnoreMouseEvents(!!ignore, { forward: true })
}

// Push the user's chosen text alignment to the overlay renderer.
export function setOverlayAlign(align) {
  if (overlayWin) overlayWin.webContents.send('overlay:align', align)
}

// Ask the overlay renderer to re-apply the stored colour theme / wallpaper background
// (it reads the same localStorage the main window writes).
export function sendOverlayTheme() {
  if (overlayWin) overlayWin.webContents.send('overlay:theme')
}

export function isOverlayOpen() {
  return !!overlayWin
}
