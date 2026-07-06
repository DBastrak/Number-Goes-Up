import { useState, useRef, useEffect } from 'react'
import { ACTIVITY_DEFS } from '../data/activityDefs'
import caseOpenMp3 from '../assets/case-open.mp3'
import '../styles/radfun.css'

// Raid & Dungeon roulette, CS:GO case-opening style: a horizontal reel of activity
// cards scrolls past the centre marker, decelerates, and lands on the winner. Only
// currently playable content — vaulted raids are excluded.

const VAULTED = new Set([
  'Leviathan',
  'Leviathan, Eater of Worlds',
  'Leviathan, Spire of Stars',
  'Scourge of the Past',
  'Crown of Sorrow',
  'Pantheon' // event content, not always available
])

const DEFS = {
  raid: ACTIVITY_DEFS.filter((d) => d.type === 'raid' && !VAULTED.has(d.name)),
  dungeon: ACTIVITY_DEFS.filter((d) => d.type === 'dungeon')
}

// Persist which activities are un-ticked (so newly released ones default to included).
const EXCLUDE_KEY = (mode) => `steamreport.roulette.excluded.${mode}`
function loadExcluded(mode) {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXCLUDE_KEY(mode)) || '[]'))
  } catch {
    return new Set()
  }
}

const TILE_W = 408 // card width (384) + gap (24) — keep in sync with .reel-tile CSS
// Fallback spin length — replaced by the case-opening sound's real duration once its
// metadata loads, so the reel stops exactly when the audio does.
const DEFAULT_SPIN_MS = 5200
const WINNER_AT = 42 // reel index where the winning card sits

function buildReel(pool) {
  // Random filler cards, with the winner planted at WINNER_AT and a few cards after
  // it so the reel doesn't run out of tiles at the end of the animation.
  const winner = pool[Math.floor(Math.random() * pool.length)]
  const tiles = []
  for (let i = 0; i < WINNER_AT + 6; i++) {
    // Avoid immediate repeats so the strip looks shuffled.
    let pick = pool[Math.floor(Math.random() * pool.length)]
    if (pool.length > 1 && tiles[i - 1]?.name === pick.name) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length]
    }
    tiles.push(pick)
  }
  tiles[WINNER_AT] = winner
  return { tiles, winner }
}

export default function Roulette() {
  const [mode, setMode] = useState('raid') // 'raid' | 'dungeon'
  const [excluded, setExcluded] = useState(() => loadExcluded('raid'))
  const [reel, setReel] = useState(null) // { tiles, winner }
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const [spinMs, setSpinMs] = useState(DEFAULT_SPIN_MS)
  const viewportRef = useRef(null)
  const spinTimer = useRef(null)
  const audioRef = useRef(null)

  const pool = DEFS[mode].filter((d) => !excluded.has(d.name))

  // Case-opening sound. The reel's spin duration tracks the audio's real length so
  // both finish together.
  useEffect(() => {
    const audio = new Audio(caseOpenMp3)
    audio.preload = 'auto'
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 1) {
        // Stop the reel ~1s before the audio ends (the clip's tail plays over the
        // revealed winner, like the case-opened jingle).
        setSpinMs(Math.max(1000, Math.round(audio.duration * 1000) - 2700))
      }
    })
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimeout(spinTimer.current), [])

  function switchMode(next) {
    if (spinning || next === mode) return
    setMode(next)
    setExcluded(loadExcluded(next))
    setReel(null)
    setResult(null)
    setOffset(0)
    setAnimate(false)
  }

  function toggle(name) {
    if (spinning) return
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      localStorage.setItem(EXCLUDE_KEY(mode), JSON.stringify([...next]))
      return next
    })
    setReel(null)
    setResult(null)
    setOffset(0)
    setAnimate(false)
  }

  function spin() {
    if (spinning || pool.length < 2) return
    const next = buildReel(pool)
    const viewportW = viewportRef.current?.clientWidth || 640
    // Land the winner card under the centre marker, with jitter inside the card so
    // it doesn't stop dead-centre every time.
    const jitter = (Math.random() - 0.5) * TILE_W * 0.7
    const target = WINNER_AT * TILE_W + TILE_W / 2 - viewportW / 2 + jitter

    // Reset the strip to the start without animating, then kick off the ease-out
    // scroll on the next frame so the transition actually runs.
    setReel(next)
    setResult(null)
    setAnimate(false)
    setOffset(0)
    setSpinning(true)
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = 0
      audio.play().catch(() => {
        /* autoplay refusal — spin silently */
      })
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnimate(true)
        setOffset(target)
      })
    )
    spinTimer.current = setTimeout(() => {
      setSpinning(false)
      setResult(next.winner.name)
    }, spinMs + 150)
  }

  const all = DEFS[mode]

  return (
    <div className="roulette">
      {/* Menu on top: mode toggle + the pool tick-list */}
      <div className="roulette-menu">
        <div className="roulette-modes">
          <button
            className={`roulette-mode ${mode === 'raid' ? 'is-active' : ''}`}
            onClick={() => switchMode('raid')}
          >
            ⚔ Raids
          </button>
          <button
            className={`roulette-mode ${mode === 'dungeon' ? 'is-active' : ''}`}
            onClick={() => switchMode('dungeon')}
          >
            ☠ Dungeons
          </button>
        </div>
        <div className="roulette-picks">
          {all.map((d) => (
            <label
              key={d.name}
              className={`roulette-item ${excluded.has(d.name) ? 'is-off' : ''}`}
              style={
                d.bg
                  ? {
                      backgroundImage: `linear-gradient(rgba(11,16,23,0.3), rgba(11,16,23,0.75)), url(${d.bg})`
                    }
                  : undefined
              }
            >
              <input
                type="checkbox"
                checked={!excluded.has(d.name)}
                onChange={() => toggle(d.name)}
                disabled={spinning}
              />
              <span className="roulette-item-name">{d.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="roulette-main">
        <div className="reel-viewport" ref={viewportRef}>
          <div className="reel-marker" aria-hidden="true" />
          <div
            className="reel-strip"
            style={{
              transform: `translateX(${-offset}px)`,
              transition: animate
                ? `transform ${spinMs}ms cubic-bezier(0.08, 0.6, 0.04, 1)`
                : 'none'
            }}
          >
            {(reel?.tiles || pool).map((d, i) => (
              <div
                key={`${d.name}-${i}`}
                className={`reel-tile ${
                  result && reel && i === WINNER_AT ? 'is-winner' : ''
                }`}
                style={
                  d.bg
                    ? {
                        backgroundImage: `linear-gradient(rgba(11,16,23,0.25), rgba(11,16,23,0.85)), url(${d.bg})`
                      }
                    : undefined
                }
              >
                <span className="reel-tile-name">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="bingo-btn bingo-btn-primary roulette-spin"
          onClick={spin}
          disabled={spinning || pool.length < 2}
        >
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
        {pool.length < 2 && <p className="roulette-hint">Tick at least two {mode}s to spin.</p>}
        {result && (
          <p className="roulette-result">
            You’re running: <strong>{result}</strong>
          </p>
        )}
      </div>
    </div>
  )
}
