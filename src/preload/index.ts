import { contextBridge, ipcRenderer } from 'electron'

// The shape of the bridge exposed to the renderer as `window.api`. Data-heavy results
// (Bungie responses, activity rows) stay loosely typed as `any` for now — the typed
// boundary is the method signatures, not every nested Bungie field.
export interface Api {
  // Runs the 3-step Bungie lookup in the main process and returns
  // { ok: true, session } or { ok: false, error }.
  login: (username: string) => Promise<any>

  // The app version (from package.json).
  getAppVersion: () => Promise<string>

  // Returns the saved session (for auto-restore on launch), or null.
  getSession: () => Promise<any>

  // Signs out and forgets the saved account.
  logout: () => Promise<{ ok: boolean }>

  // Loads all raid + dungeon activities for the logged-in account.
  // Returns { ok: true, activities, characterIds, ... } or { ok: false, error }.
  loadActivities: () => Promise<any>

  // Fetches one activity's Post Game Carnage Report.
  // Returns { ok: true, pgcr } or { ok: false, error }.
  getPgcr: (instanceId: string) => Promise<any>

  // Polls the player's current live activity (timer, name, loadout, fireteam).
  getLiveActivity: () => Promise<any>

  // Following (other tracked accounts).
  followingList: () => Promise<any>
  followingAdd: (username: string) => Promise<any>
  followingRemove: (membershipId: string) => Promise<any>
  followingStats: (membershipType: number, membershipId: string) => Promise<any>
  followingBreakdown: (membershipType: number, membershipId: string) => Promise<any>
  followingNewClears: (since: string) => Promise<any>

  // Overlay timer window controls.
  getDisplays: () => Promise<any>
  getOverlayConfig: () => Promise<any>
  setOverlay: (cfg: { enabled: boolean; displayId: number | null }) => Promise<any>
  moveOverlay: (displayId: number) => Promise<any>
  // Pin: toggle whether the overlay is locked (click-through) or draggable.
  toggleOverlayLock: () => Promise<{ locked: boolean }>
  // While locked, momentarily capture the mouse so the pin hotspot is clickable.
  setOverlayIgnoreMouse: (ignore: boolean) => void
  // Subscribe to lock-state changes pushed from the main process. Returns an unsubscribe fn.
  onOverlayLocked: (cb: (locked: boolean) => void) => () => void
  // Subscribe to which screen half ('left' | 'right') the overlay is on, for text align.
  onOverlaySide: (cb: (side: 'left' | 'right') => void) => () => void
  // Timer text alignment: 'auto' | 'left' | 'center' | 'right'.
  setOverlayAlign: (align: string) => Promise<{ align: string }>
  onOverlayAlign: (cb: (align: string) => void) => () => void
  // Tell the overlay to re-apply the colour theme / wallpaper background after a change.
  refreshOverlayTheme: () => void
  onOverlayTheme: (cb: () => void) => () => void

  // Total raid + dungeon clears completed today (recomputed live).
  getTodayClears: () => Promise<{ ok: boolean; count?: number; error?: string }>

  // Auto-update: notified when a new version has downloaded; restart to apply it.
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void
  restartToUpdate: () => void

  // Wallpaper custom background (user-chosen image/gif, returned as a data URL).
  wallpaperGetImage: () => Promise<{ type: string; dataUrl?: string; name?: string }>
  wallpaperPickImage: () => Promise<{
    ok: boolean
    dataUrl?: string
    name?: string
    canceled?: boolean
    error?: string
  }>
  wallpaperResetImage: () => Promise<{ ok: boolean }>

  // Foxy jumpscare overlay window.
  triggerJumpscare: () => void
  closeJumpscare: () => void

  // Frameless-window controls for the custom in-app title bar.
  minimizeWindow: () => void
  toggleMaximizeWindow: () => void
  closeWindow: () => void
}

// Safe bridge between the renderer (React) and the main process.
const api: Api = {
  login: (username) => ipcRenderer.invoke('login', username),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  getSession: () => ipcRenderer.invoke('get-session'),

  logout: () => ipcRenderer.invoke('logout'),

  loadActivities: () => ipcRenderer.invoke('load-activities'),

  getPgcr: (instanceId) => ipcRenderer.invoke('get-pgcr', instanceId),

  getLiveActivity: () => ipcRenderer.invoke('get-live-activity'),

  // Following (other tracked accounts).
  followingList: () => ipcRenderer.invoke('following:list'),
  followingAdd: (username) => ipcRenderer.invoke('following:add', username),
  followingRemove: (membershipId) => ipcRenderer.invoke('following:remove', membershipId),
  followingStats: (membershipType, membershipId) =>
    ipcRenderer.invoke('following:stats', membershipType, membershipId),
  followingBreakdown: (membershipType, membershipId) =>
    ipcRenderer.invoke('following:breakdown', membershipType, membershipId),
  followingNewClears: (since) => ipcRenderer.invoke('following:new-clears', since),

  // Overlay timer window controls.
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getOverlayConfig: () => ipcRenderer.invoke('get-overlay-config'),
  setOverlay: (cfg) => ipcRenderer.invoke('set-overlay', cfg),
  moveOverlay: (displayId) => ipcRenderer.invoke('move-overlay', displayId),
  toggleOverlayLock: () => ipcRenderer.invoke('overlay:toggle-lock'),
  setOverlayIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),
  onOverlayLocked: (cb) => {
    const listener = (_event, locked) => cb(locked)
    ipcRenderer.on('overlay:locked', listener)
    return () => ipcRenderer.removeListener('overlay:locked', listener)
  },
  onOverlaySide: (cb) => {
    const listener = (_event, side) => cb(side)
    ipcRenderer.on('overlay:side', listener)
    return () => ipcRenderer.removeListener('overlay:side', listener)
  },
  setOverlayAlign: (align) => ipcRenderer.invoke('overlay:set-align', align),
  onOverlayAlign: (cb) => {
    const listener = (_event, align) => cb(align)
    ipcRenderer.on('overlay:align', listener)
    return () => ipcRenderer.removeListener('overlay:align', listener)
  },
  refreshOverlayTheme: () => ipcRenderer.send('overlay:refresh-theme'),
  onOverlayTheme: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('overlay:theme', listener)
    return () => ipcRenderer.removeListener('overlay:theme', listener)
  },
  getTodayClears: () => ipcRenderer.invoke('get-today-clears'),

  // Auto-update.
  onUpdateDownloaded: (cb) => {
    const listener = (_event, info) => cb(info)
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  },
  restartToUpdate: () => ipcRenderer.send('update:restart'),

  // Wallpaper custom background.
  wallpaperGetImage: () => ipcRenderer.invoke('wallpaper:get'),
  wallpaperPickImage: () => ipcRenderer.invoke('wallpaper:pick'),
  wallpaperResetImage: () => ipcRenderer.invoke('wallpaper:reset'),

  // Foxy jumpscare overlay window.
  triggerJumpscare: () => ipcRenderer.send('jumpscare:show'),
  closeJumpscare: () => ipcRenderer.send('jumpscare:done'),

  // Frameless-window controls for the custom in-app title bar.
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
