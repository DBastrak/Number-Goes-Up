// Colour themes + live accent application via CSS custom properties.

import wallpaperGif from '../assets/wallpaper.gif'

export const THEMES = [
  { id: 'steam', name: 'Steam Blue', accent: '#66c0f4', accent2: '#1a9fff', teal: '#4bc2a8' },
  { id: 'crimson', name: 'Crimson', accent: '#ff6b6b', accent2: '#e03131', teal: '#ffa94d' },
  { id: 'emerald', name: 'Emerald', accent: '#51cf66', accent2: '#2f9e44', teal: '#63e6be' },
  { id: 'amethyst', name: 'Amethyst', accent: '#cc5de8', accent2: '#9c36b5', teal: '#da77f2' },
  { id: 'solar', name: 'Solar', accent: '#ffa94d', accent2: '#f76707', teal: '#ffd43b' },
  { id: 'rose', name: 'Rose', accent: '#f783ac', accent2: '#e64980', teal: '#faa2c1' },
  { id: 'mono', name: 'Mono', accent: '#c7d5e0', accent2: '#8da3b3', teal: '#a9bccf' }
]

const STORAGE_KEY = 'sr-theme'

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return { r: 102, g: 192, b: 244 }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export function rgbToHex(r, g, b) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// Multiply each channel by (1 + pct) to lighten/darken.
function shade(hex, pct) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r * (1 + pct), g * (1 + pct), b * (1 + pct))
}

// Linear blend between two hex colours (t = 0 → a, t = 1 → b).
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
}

// Dark surface palette derived by tinting near-black bases toward the accent, so the
// whole UI (backgrounds, panels, borders) shifts to match the selected theme. The base
// colours + mix amounts reproduce the original Steam look when the accent is Steam blue.
const SURFACE_BASE: Record<string, [string, number]> = {
  '--bg-0': ['#0a0e12', 0.05],
  '--bg-1': ['#12181f', 0.07],
  '--bg-2': ['#1a2330', 0.1],
  '--bg-3': ['#24303f', 0.15],
  '--panel': ['#0f151c', 0.06],
  '--panel-2': ['#18212c', 0.09],
  '--border': ['#243140', 0.2]
}

function setVars({ accent, accent2, teal }) {
  const root = document.documentElement
  root.style.setProperty('--accent', accent)
  const { r, g, b } = hexToRgb(accent)
  // Exposed as an "r, g, b" triple so CSS can build accent-tinted rgba() glows.
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  if (accent2) root.style.setProperty('--accent-2', accent2)
  if (teal) root.style.setProperty('--teal', teal)
  for (const [name, [base, t]] of Object.entries(SURFACE_BASE)) {
    root.style.setProperty(name, mix(base, accent, t))
  }
}

export function applyTheme(theme) {
  setVars(theme)
}

export function applyAccent(hex) {
  setVars({ accent: hex, accent2: shade(hex, -0.2), teal: shade(hex, 0.15) })
}

// --- Persistence (client-only, localStorage) ---
export function savePref(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
  } catch {
    /* ignore */
  }
}

export function loadPref() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

// Apply just the saved colour theme (preset or custom accent), defaulting to Steam.
function applyStoredColor() {
  const pref = loadPref()
  if (pref?.type === 'custom' && pref.hex) {
    applyAccent(pref.hex)
  } else if (pref?.type === 'preset') {
    const theme = THEMES.find((t) => t.id === pref.id) || THEMES[0]
    applyTheme(theme)
  } else {
    applyTheme(THEMES[0])
  }
}

// Apply the stored theme on app start (before/at first render). Wallpaper, if enabled,
// overrides the colour theme.
export function applyStoredTheme() {
  if (loadWallpaper()) applyWallpaper(true)
  else applyStoredColor()
}

// --- Wallpaper theme: pink palette + anime cat wallpaper (a fun override toggle) ---
const WALLPAPER_KEY = 'sr-wallpaper'
const WALLPAPER = { accent: '#ff8fd1', accent2: '#ff5fb0', teal: '#ffd0ec' }

export function loadWallpaper() {
  try {
    return localStorage.getItem(WALLPAPER_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveWallpaper(on) {
  try {
    localStorage.setItem(WALLPAPER_KEY, on ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

// Toggle the wallpaper overlay: add the body class + pink palette, or revert to the
// user's chosen colour theme.
export function applyWallpaper(on) {
  const root = document.documentElement
  if (on) {
    // Show the bundled gif immediately, then swap in the user's custom image if set.
    root.style.setProperty('--wallpaper-bg', `url(${wallpaperGif})`)
    root.classList.add('is-wallpaper')
    setVars(WALLPAPER)
    refreshWallpaperBg()
  } else {
    root.classList.remove('is-wallpaper')
    applyStoredColor()
  }
  // Let the app re-render the wallpaper layer (rendered as a real element so it can't be
  // hidden by an opaque ancestor).
  window.dispatchEvent(new CustomEvent('wallpaper-change', { detail: !!on }))
}

// Point --wallpaper-bg at the user's chosen image (a data URL from the main process) if one
// is set, otherwise the bundled cat gif. Call after the choice changes.
export async function refreshWallpaperBg() {
  const root = document.documentElement
  try {
    const res = await window.api?.wallpaperGetImage?.()
    if (res?.type === 'custom' && res.dataUrl) {
      // A user-chosen image fills the whole window (cover): scaled up if needed and
      // cropped, never stretched out of aspect.
      root.style.setProperty('--wallpaper-bg', `url("${res.dataUrl}")`)
      root.style.setProperty('--wallpaper-size', 'cover')
      root.style.setProperty('--wallpaper-repeat', 'no-repeat')
      return
    }
  } catch {
    /* fall back to the default below */
  }
  // The bundled cat is small, so it looks best tiled rather than upscaled to cover.
  root.style.setProperty('--wallpaper-bg', `url(${wallpaperGif})`)
  root.style.setProperty('--wallpaper-size', '240px auto')
  root.style.setProperty('--wallpaper-repeat', 'repeat')
}

// --- Interface preferences (run filters) ---
const UI_KEY = 'sr-ui'
const UI_DEFAULTS = { hideIncomplete: false, jumpscare: true }

export function loadUiPref() {
  try {
    return { ...UI_DEFAULTS, ...(JSON.parse(localStorage.getItem(UI_KEY)) || {}) }
  } catch {
    return { ...UI_DEFAULTS }
  }
}

export function saveUiPref(pref) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(pref))
  } catch {
    /* ignore */
  }
}
