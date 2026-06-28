import { useCallback, useEffect, useRef, useState } from 'react'
import { applyStoredTheme } from './utils/theme'
import './styles/overlay.css'

const POLL_MS = 2500
const CLEARS_POLL_MS = 90000

function formatElapsed(ms) {
  if (ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export default function Overlay() {
  const [live, setLive] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [locked, setLocked] = useState(true)
  const [side, setSide] = useState('left') // auto: which screen half the overlay sits on
  const [align, setAlign] = useState('auto') // user setting: auto | left | center | right
  const [todayClears, setTodayClears] = useState<number | null>(null)
  const pinRef = useRef(null)

  // Initial lock + alignment, and subscribe to lock / screen-side / alignment changes.
  useEffect(() => {
    window.api?.getOverlayConfig?.().then((c) => {
      if (typeof c?.locked === 'boolean') setLocked(c.locked)
      if (c?.align) setAlign(c.align)
    })
    const offLock = window.api?.onOverlayLocked?.((v) => setLocked(v))
    const offSide = window.api?.onOverlaySide?.((s) => setSide(s))
    const offAlign = window.api?.onOverlayAlign?.((a) => setAlign(a))
    // Re-apply the colour theme / wallpaper background when the main window changes it.
    const offTheme = window.api?.onOverlayTheme?.(() => applyStoredTheme())
    return () => {
      offLock?.()
      offSide?.()
      offAlign?.()
      offTheme?.()
    }
  }, [])

  // Poll the live activity for the timer.
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await window.api?.getLiveActivity?.()
        if (!cancelled && res?.ok) setLive(res)
      } catch {
        /* ignore */
      }
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Today's raid + dungeon clears. Refresh on a slow interval as a fallback…
  const fetchClears = useCallback(async () => {
    try {
      const r = await window.api?.getTodayClears?.()
      if (r?.ok) setTodayClears(r.count)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    fetchClears()
    const id = setInterval(fetchClears, CLEARS_POLL_MS)
    return () => clearInterval(id)
  }, [fetchClears])

  // …and immediately after a raid/dungeon ends (a likely new clear). Bungie takes a
  // moment to register the completion, so re-check a couple of times.
  const wasInRaidDungeon = useRef(false)
  useEffect(() => {
    const inRD = !!(live?.inActivity && live?.isRaidOrDungeon)
    if (wasInRaidDungeon.current && !inRD) {
      const t1 = setTimeout(fetchClears, 10000)
      const t2 = setTimeout(fetchClears, 30000)
      wasInRaidDungeon.current = inRD
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
    wasInRaidDungeon.current = inRD
  }, [live, fetchClears])

  // When locked the window is click-through (forward:true), so clicks fall through to
  // whatever is underneath. Track the cursor and only capture the mouse while it's over
  // the pin, keeping the pin clickable without blocking the rest of the screen. When
  // unlocked the whole overlay is interactive.
  useEffect(() => {
    if (!locked) {
      window.api?.setOverlayIgnoreMouse?.(false)
      return
    }
    const onMove = (e) => {
      const r = pinRef.current?.getBoundingClientRect()
      const over =
        r &&
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      window.api?.setOverlayIgnoreMouse?.(!over)
    }
    window.api?.setOverlayIgnoreMouse?.(true)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [locked])

  async function togglePin() {
    const res = await window.api?.toggleOverlayLock?.()
    if (typeof res?.locked === 'boolean') setLocked(res.locked)
  }

  const active = live?.inActivity && !live.isOrbit && live.startedAt
  const elapsed = active ? now - Date.parse(live.startedAt) : 0
  // 'auto' follows the screen side; otherwise use the explicit choice.
  const effAlign = align === 'auto' ? side : align

  const pin = (
    <button
      ref={pinRef}
      className={`overlay-pin ${locked ? 'is-locked' : 'is-unlocked'}`}
      onClick={togglePin}
      title={locked ? 'Unlock to move the overlay' : 'Lock the overlay in place'}
    >
      📌
    </button>
  )

  const todayLine = (
    <div className="overlay-today">
      <span className="overlay-today-label">Today</span>
      <span className="overlay-today-value">{todayClears ?? '—'}</span>
      <span className="overlay-today-label">full clears</span>
    </div>
  )

  return (
    <div className={`overlay align-${effAlign} ${locked ? '' : 'is-unlocked'}`}>
      <div className={`overlay-card ${locked ? '' : 'is-draggable'}`}>
        {pin}
        {active && (
          <>
            <div className="overlay-timer">{formatElapsed(elapsed)}</div>
            <div className="overlay-name">{live.activityName}</div>
          </>
        )}
        {todayLine}
        {!active && !locked && (
          <div className="overlay-hint">Drag to position · click 📌 to lock</div>
        )}
      </div>
    </div>
  )
}
