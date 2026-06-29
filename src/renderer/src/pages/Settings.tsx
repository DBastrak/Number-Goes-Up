import { useState, useEffect } from 'react'
import {
  THEMES,
  applyTheme,
  applyAccent,
  savePref,
  loadPref,
  loadUiPref,
  saveUiPref,
  loadWallpaper,
  saveWallpaper,
  applyWallpaper,
  refreshWallpaperBg,
  loadAccentOverride,
  saveAccentOverride,
  applyWallpaperAccent,
  hexToRgb,
  rgbToHex
} from '../utils/theme'
import '../styles/settings.css'

export default function Settings() {
  const pref = loadPref()
  const [activePreset, setActivePreset] = useState(
    pref?.type === 'preset' ? pref.id : pref ? null : 'steam'
  )
  const [rgb, setRgb] = useState(hexToRgb(pref?.type === 'custom' ? pref.hex : '#66c0f4'))

  // Interface prefs: persisted to localStorage.
  const [ui, setUi] = useState(loadUiPref())

  // Wallpaper mode: pink palette + anime cat wallpaper. Overrides the colour theme.
  const [wallpaper, setWallpaper] = useState(loadWallpaper())
  const [wallpaperBgName, setWallpaperBgName] = useState<string | null>(null)
  // Accent override: use the RGB picker as the accent over a wallpaper background, instead
  // of the colour auto-pulled from the image.
  const [accentOverride, setAccentOverride] = useState(loadAccentOverride())

  function toggleAccentOverride(v) {
    setAccentOverride(v)
    saveAccentOverride(v)
    if (wallpaper) {
      refreshWallpaperBg() // re-applies: picked accent if on, image colour if off
      window.api?.refreshOverlayTheme?.()
    }
  }

  useEffect(() => {
    window.api?.wallpaperGetImage?.().then((r) => {
      if (r?.type === 'custom' && r.name) setWallpaperBgName(r.name)
    })
  }, [])

  // App version, shown at the bottom (from package.json via the main process).
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.api?.getAppVersion?.().then(setVersion)
  }, [])

  function toggleWallpaper(v) {
    setWallpaper(v)
    saveWallpaper(v)
    applyWallpaper(v)
    window.api?.refreshOverlayTheme?.()
  }

  async function pickWallpaperBg() {
    const res = await window.api?.wallpaperPickImage?.()
    if (res?.ok) {
      setWallpaperBgName(res.name || 'Custom image')
      await refreshWallpaperBg()
      if (!wallpaper) toggleWallpaper(true) // turn wallpaper on so the new background is visible
      window.api?.refreshOverlayTheme?.()
    } else if (res && !res.canceled && res.error) {
      // eslint-disable-next-line no-alert
      alert(res.error)
    }
  }

  async function resetWallpaperBg() {
    await window.api?.wallpaperResetImage?.()
    setWallpaperBgName(null)
    await refreshWallpaperBg()
    window.api?.refreshOverlayTheme?.()
  }

  function updateUi(patch) {
    const next = { ...ui, ...patch }
    setUi(next)
    saveUiPref(next)
  }

  // Overlay timer: list of monitors + persisted config (lives in the main process).
  const [displays, setDisplays] = useState([])
  const [overlay, setOverlay] = useState({ enabled: false, displayId: null, align: 'auto' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api?.getDisplays?.() || [],
      window.api?.getOverlayConfig?.() || { enabled: false, displayId: null, align: 'auto' }
    ]).then(([list, cfg]) => {
      if (cancelled) return
      setDisplays(list)
      const primary = list.find((d) => d.primary)
      setOverlay({
        enabled: !!cfg.enabled,
        displayId: cfg.displayId ?? primary?.id ?? list[0]?.id ?? null,
        align: cfg.align ?? 'auto'
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  function updateOverlay(patch) {
    const next = { ...overlay, ...patch }
    setOverlay(next)
    window.api?.setOverlay?.(next)
  }

  // Alignment is persisted + pushed to the overlay separately from enable/monitor.
  function updateAlign(align) {
    setOverlay((o) => ({ ...o, align }))
    window.api?.setOverlayAlign?.(align)
  }

  const customHex = rgbToHex(rgb.r, rgb.g, rgb.b)

  // While wallpaper is on it owns the live palette — so colour edits are normally just
  // saved. But with the accent override on, the picked accent is applied live (over the
  // wallpaper background) using the stronger wallpaper tint.
  function selectPreset(theme) {
    setActivePreset(theme.id)
    if (!wallpaper) applyTheme(theme)
    else if (accentOverride) applyWallpaperAccent(theme.accent)
    savePref({ type: 'preset', id: theme.id })
    window.api?.refreshOverlayTheme?.()
  }

  function setChannel(channel, value) {
    const next = { ...rgb, [channel]: Number(value) }
    setRgb(next)
    setActivePreset(null)
    const hex = rgbToHex(next.r, next.g, next.b)
    if (!wallpaper) applyAccent(hex)
    else if (accentOverride) applyWallpaperAccent(hex)
    savePref({ type: 'custom', hex })
    window.api?.refreshOverlayTheme?.()
  }

  function setFromHex(hex) {
    const next = hexToRgb(hex)
    setRgb(next)
    setActivePreset(null)
    if (!wallpaper) applyAccent(hex)
    else if (accentOverride) applyWallpaperAccent(hex)
    savePref({ type: 'custom', hex })
    window.api?.refreshOverlayTheme?.()
  }

  return (
    <div className="settings">
      <header className="settings-header">
        <h2 className="settings-heading">Settings</h2>
        <p className="settings-subheading">Appearance &amp; interface options.</p>
      </header>

      <section className="settings-group">
        <h3 className="settings-group-title">Kawaii mode</h3>
        <Row
          label="Kawaii mode 🐱✨"
          hint="Dancing anime cat wallpaper + a pink theme. Overrides the colour theme below while on."
        >
          <Toggle checked={wallpaper} onChange={toggleWallpaper} />
        </Row>
        <Row
          label="Background image"
          hint="Pick your own image or GIF — the UI colours are pulled from it. (PNG, JPG, GIF, WebP, max 30 MB.)"
        >
          <div className="wallpaper-bg-controls">
            <button type="button" className="wallpaper-bg-btn" onClick={pickWallpaperBg}>
              Browse…
            </button>
            {wallpaperBgName && (
              <>
                <span className="wallpaper-bg-name" title={wallpaperBgName}>
                  {wallpaperBgName}
                </span>
                <button
                  type="button"
                  className="wallpaper-bg-btn is-ghost"
                  onClick={resetWallpaperBg}
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </Row>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">Colour theme</h3>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-swatch ${activePreset === theme.id ? 'is-active' : ''}`}
              onClick={() => selectPreset(theme)}
              title={theme.name}
            >
              <span
                className="theme-swatch-dot"
                style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})` }}
              />
              <span className="theme-swatch-name">{theme.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">Custom accent (RGB)</h3>
        <div className="rgb-row">
          <div className="rgb-preview" style={{ background: customHex }}>
            <input
              type="color"
              value={customHex}
              onChange={(e) => setFromHex(e.target.value)}
              aria-label="Pick accent colour"
            />
          </div>
          <div className="rgb-sliders">
            <Slider label="R" color="#ff5555" value={rgb.r} onChange={(v) => setChannel('r', v)} />
            <Slider label="G" color="#55dd55" value={rgb.g} onChange={(v) => setChannel('g', v)} />
            <Slider label="B" color="#5588ff" value={rgb.b} onChange={(v) => setChannel('b', v)} />
          </div>
          <div className="rgb-readout">
            <code>{customHex.toUpperCase()}</code>
            <small>
              rgb({rgb.r}, {rgb.g}, {rgb.b})
            </small>
          </div>
        </div>
        <Row
          label="Override wallpaper accent"
          hint="Use this colour as the accent even with a kawaii background, instead of the colour pulled from the image."
        >
          <Toggle checked={accentOverride} onChange={toggleAccentOverride} />
        </Row>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">Interface</h3>
        <Row label="Hide incomplete runs" hint="Only show completed raids & dungeons in Recent Runs">
          <Toggle checked={ui.hideIncomplete} onChange={(v) => updateUi({ hideIncomplete: v })} />
        </Row>
        <Row
          label="Foxy jumpscare"
          hint="Occasionally pop up the full-screen foxy when you hit a Bingo"
        >
          <Toggle checked={ui.jumpscare} onChange={(v) => updateUi({ jumpscare: v })} />
        </Row>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">Overlay timer</h3>
        <Row
          label="Show overlay timer"
          hint="Always-on-top activity timer. Click the 📌 pin on the overlay to drag it anywhere, click it again to lock it in place"
        >
          <Toggle checked={overlay.enabled} onChange={(v) => updateOverlay({ enabled: v })} />
        </Row>
        <Row label="Monitor" hint="Which display the overlay appears on">
          <select
            className="settings-select"
            value={overlay.displayId ?? ''}
            onChange={(e) => updateOverlay({ displayId: Number(e.target.value) })}
          >
            {displays.length === 0 && <option value="">No displays found</option>}
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
                {d.primary ? ' (primary)' : ''} — {d.width}×{d.height}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Timer alignment" hint="How the overlay text lines up">
          <select
            className="settings-select"
            value={overlay.align}
            onChange={(e) => updateAlign(e.target.value)}
          >
            <option value="auto">Auto (by screen side)</option>
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </Row>
      </section>

      <footer className="settings-version">number go up{version ? ` v${version}` : ''}</footer>
    </div>
  )
}

function Slider({ label, color, value, onChange }) {
  return (
    <label className="rgb-slider">
      <span className="rgb-slider-label" style={{ color }}>
        {label}
      </span>
      <input type="range" min="0" max="255" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="rgb-slider-value">{value}</span>
    </label>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggle-knob" />
    </button>
  )
}
