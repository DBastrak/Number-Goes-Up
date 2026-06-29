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

// surfaceTint scales how strongly the backgrounds/panels/borders lean toward the accent.
// 1 = the subtle default used by the colour themes; wallpaper mode bumps it so the whole
// UI clearly carries the image's colour.
function setVars({ accent, accent2, teal }, surfaceTint = 1) {
  const root = document.documentElement
  root.style.setProperty('--accent', accent)
  const { r, g, b } = hexToRgb(accent)
  // Exposed as an "r, g, b" triple so CSS can build accent-tinted rgba() glows.
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  if (accent2) root.style.setProperty('--accent-2', accent2)
  if (teal) root.style.setProperty('--teal', teal)
  for (const [name, [base, t]] of Object.entries(SURFACE_BASE)) {
    root.style.setProperty(name, mix(base, accent, Math.min(1, t * surfaceTint)))
  }
}

export function applyTheme(theme) {
  setVars(theme)
}

export function applyAccent(hex, surfaceTint = 1) {
  setVars({ accent: hex, accent2: shade(hex, -0.2), teal: shade(hex, 0.15) }, surfaceTint)
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
// Wallpaper mode tints surfaces harder than the colour themes so the image's colour
// reads across the whole UI (panels, cards, borders), not just the accents.
const WALLPAPER_TINT = 2

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

// Accent override: when on, wallpaper mode uses the colour-picker accent instead of the
// colour auto-extracted from the background image.
const ACCENT_OVERRIDE_KEY = 'sr-accent-override'
export function loadAccentOverride() {
  try {
    return localStorage.getItem(ACCENT_OVERRIDE_KEY) === 'true'
  } catch {
    return false
  }
}
export function saveAccentOverride(on) {
  try {
    localStorage.setItem(ACCENT_OVERRIDE_KEY, on ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}
// The accent currently chosen via the colour picker / preset (used when override is on).
function storedAccentHex() {
  const pref = loadPref()
  if (pref?.type === 'custom' && pref.hex) return pref.hex
  if (pref?.type === 'preset') return (THEMES.find((t) => t.id === pref.id) || THEMES[0]).accent
  return THEMES[0].accent
}
// Apply an accent at the wallpaper-mode surface tint — used live by the RGB picker while
// the override is on, so the custom accent shows over the chosen background.
export function applyWallpaperAccent(hex) {
  applyAccent(hex, WALLPAPER_TINT)
}

// Toggle the wallpaper overlay: add the body class + pink palette, or revert to the
// user's chosen colour theme.
export function applyWallpaper(on) {
  const root = document.documentElement
  if (on) {
    // Show the bundled gif immediately, then swap in the user's custom image if set.
    root.style.setProperty('--wallpaper-bg', `url(${wallpaperGif})`)
    root.classList.add('is-wallpaper')
    setVars(WALLPAPER, WALLPAPER_TINT)
    refreshWallpaperBg()
  } else {
    root.classList.remove('is-wallpaper')
    applyStoredColor()
  }
  // Let the app re-render the wallpaper layer (rendered as a real element so it can't be
  // hidden by an opaque ancestor).
  window.dispatchEvent(new CustomEvent('wallpaper-change', { detail: !!on }))
}

// Brighten/saturate an averaged colour so it reads as an accent on the dark UI.
function normalizeAccent(r, g, b) {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (lum < 0.5) {
    const f = 0.5 / Math.max(lum, 0.05)
    r = Math.min(255, r * f)
    g = Math.min(255, g * f)
    b = Math.min(255, b * f)
  }
  return rgbToHex(r, g, b)
}

// Pull the dominant *vibrant* colour out of an image (data URL) to use as the UI accent.
// Resolves to a hex string, or null if nothing colourful enough is found (e.g. greyscale).
function extractAccentFromImage(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const S = 64 // downscale for speed; first frame of a gif is fine
        const canvas = document.createElement('canvas')
        canvas.width = S
        canvas.height = S
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, S, S)
        const { data } = ctx.getImageData(0, 0, S, S)
        const buckets = new Map<string, { n: number; r: number; g: number; b: number }>()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          if (data[i + 3] < 200) continue // skip transparent
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
          if (sat < 0.25 || lum < 0.12 || lum > 0.95) continue // skip greys / near-black / near-white
          const key = `${r >> 5}-${g >> 5}-${b >> 5}` // quantise into 8 buckets per channel
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
          e.n++
          e.r += r
          e.g += g
          e.b += b
          buckets.set(key, e)
        }
        let best: { n: number; r: number; g: number; b: number } | null = null
        for (const e of buckets.values()) if (!best || e.n > best.n) best = e
        if (!best) return resolve(null)
        resolve(normalizeAccent(best.r / best.n, best.g / best.n, best.b / best.n))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

// Point --wallpaper-bg at the user's chosen image (a data URL from the main process) if one
// is set, otherwise the bundled cat gif. For a custom image the UI accent is derived from
// its dominant colour; the bundled cat falls back to the pink palette. Call after a change.
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
      if (loadAccentOverride()) {
        // Keep the user's picked accent instead of the image's colour.
        applyAccent(storedAccentHex(), WALLPAPER_TINT)
      } else {
        const accent = await extractAccentFromImage(res.dataUrl)
        if (accent) applyAccent(accent, WALLPAPER_TINT)
        else setVars(WALLPAPER, WALLPAPER_TINT)
      }
      return
    }
  } catch {
    /* fall back to the default below */
  }
  // The bundled cat is small, so it looks best tiled rather than upscaled to cover.
  root.style.setProperty('--wallpaper-bg', `url(${wallpaperGif})`)
  root.style.setProperty('--wallpaper-size', '240px auto')
  root.style.setProperty('--wallpaper-repeat', 'repeat')
  if (loadAccentOverride()) applyAccent(storedAccentHex(), WALLPAPER_TINT)
  else setVars(WALLPAPER, WALLPAPER_TINT)
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
