import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_BINGO_ITEMS } from '../data/bingoList'
import { loadUiPref } from '../utils/theme'
import '../styles/bingo.css'

// Odds of the foxy overlay firing each time a fresh line is completed.
const JUMPSCARE_CHANCE = 0.1

const STORAGE_KEY = 'steamreport.bingo.items'

function loadItemsText() {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved !== null ? saved : DEFAULT_BINGO_ITEMS.join('\n')
}

function parseItems(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Read a CSS custom property off :root so the board matches the active theme.
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// Board layout is a pure function of the grid size, so the renderer and the
// click hit-test can both derive the same cell geometry.
function geometry(n) {
  const pad = 40
  const titleH = 64
  // Cell size reduced ~36% from the original 150 / 116.
  const cellSize = n === 5 ? 96 : 74
  const boardW = cellSize * n
  return {
    pad,
    titleH,
    cellSize,
    boardW,
    W: boardW + pad * 2,
    H: boardW + pad * 2 + titleH,
    ox: pad,
    oy: pad + titleH,
    n
  }
}

// Every winning line (rows, columns, both diagonals) as arrays of cell indices.
function bingoLines(n) {
  const lines = []
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c))
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c))
  lines.push(Array.from({ length: n }, (_, i) => i * n + i))
  lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)))
  return lines
}

export default function Bingo() {
  const [text, setText] = useState(loadItemsText)
  const [size, setSize] = useState(5)
  const [freeSpace, setFreeSpace] = useState(true)
  const [addValue, setAddValue] = useState('')
  const [toast, setToast] = useState(null)
  // The currently displayed board ({ grid, freeIndex, n }) and the set of marked
  // cell indices. Marks persist until a new board is generated.
  const [board, setBoard] = useState(null)
  const [marked, setMarked] = useState(() => new Set())
  const canvasRef = useRef(null)
  const toastTimer = useRef(null)
  // Winning lines already completed on the current board, so we only react to a
  // newly-formed bingo rather than re-rolling on every click.
  const completedLines = useRef(new Set())

  const items = parseItems(text)
  const cells = size * size
  const useFree = size % 2 === 1 && freeSpace
  const need = cells - (useFree ? 1 : 0)
  const short = items.length < need

  // Persist edits.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text)
  }, [text])

  function flash(msg, isError = false) {
    setToast({ msg, isError })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  // Shrink-to-fit text wrapping within a cell.
  function wrapText(ctx, str, maxWidth, maxLines, baseFs) {
    let fs = baseFs
    while (fs > 9) {
      ctx.font = `600 ${fs}px 'Segoe UI', sans-serif`
      const words = str.split(/\s+/)
      const lines = []
      let line = ''
      for (const w of words) {
        const test = line ? line + ' ' + w : w
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line)
          line = w
        } else {
          line = test
        }
      }
      if (line) lines.push(line)
      if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) {
        return { lines, fs, lh: fs * 1.2 }
      }
      fs -= 1
    }
    ctx.font = `600 ${fs}px 'Segoe UI', sans-serif`
    return { lines: [str], fs, lh: fs * 1.2 }
  }

  const draw = useCallback(
    (currentBoard, markedSet) => {
      const canvas = canvasRef.current
      if (!canvas || !currentBoard) return
      const ctx = canvas.getContext('2d')
      const { grid, freeIndex, n } = currentBoard

      const accent = cssVar('--accent', '#66c0f4')

      const { pad, titleH, cellSize, ox, oy, W, H } = geometry(n)

      canvas.width = W
      canvas.height = H

      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#0e1419')
      g.addColorStop(1, '#1b2838')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = accent
      ctx.font = `700 ${titleH * 0.46}px 'Segoe UI', sans-serif`
      ctx.fillText('LFG BINGO', W / 2, pad + titleH * 0.42)

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const idx = r * n + c
          const x = ox + c * cellSize
          const y = oy + r * cellSize
          const isFree = idx === freeIndex

          ctx.fillStyle = isFree
            ? 'rgba(102, 192, 244, 0.12)'
            : (r + c) % 2 === 0
              ? '#1f2d3d'
              : '#16202d'
          ctx.fillRect(x, y, cellSize, cellSize)

          ctx.strokeStyle = isFree ? accent : '#2a3f54'
          ctx.lineWidth = isFree ? 3 : 1.5
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1)

          ctx.fillStyle = isFree ? accent : '#c7d5e0'
          const maxW = cellSize - 16
          const baseFs = n === 5 ? 12 : 10
          const maxLines = n === 5 ? 4 : 5
          const { lines, fs, lh } = wrapText(ctx, grid[idx], maxW, maxLines, baseFs)
          ctx.font = `600 ${fs}px 'Segoe UI', sans-serif`
          const totalH = lines.length * lh
          let ty = y + cellSize / 2 - totalH / 2 + lh / 2
          for (const ln of lines) {
            ctx.fillText(ln, x + cellSize / 2, ty)
            ty += lh
          }

          // X overlay for marked cells.
          if (markedSet && markedSet.has(idx)) {
            ctx.fillStyle = 'rgba(255, 80, 80, 0.16)'
            ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2)
            ctx.strokeStyle = '#ff5d5d'
            ctx.lineWidth = Math.max(4, cellSize * 0.07)
            ctx.lineCap = 'round'
            const m = cellSize * 0.2
            ctx.beginPath()
            ctx.moveTo(x + m, y + m)
            ctx.lineTo(x + cellSize - m, y + cellSize - m)
            ctx.moveTo(x + cellSize - m, y + m)
            ctx.lineTo(x + m, y + cellSize - m)
            ctx.stroke()
          }
        }
      }
    },
    []
  )

  const generate = useCallback(() => {
    const list = parseItems(text)
    const total = size * size
    const free = size % 2 === 1 && freeSpace
    const needed = total - (free ? 1 : 0)
    if (list.length < needed) {
      flash(`Need at least ${needed} items for ${size}×${size}`, true)
      return
    }
    const picked = shuffle(list).slice(0, needed)
    const freeIndex = free ? Math.floor(total / 2) : -1
    const grid = []
    let p = 0
    for (let i = 0; i < total; i++) {
      grid.push(i === freeIndex ? '★ FREE' : picked[p++])
    }
    // A fresh board wipes any marks; the free centre starts marked.
    const initialMarked = new Set()
    if (freeIndex >= 0) initialMarked.add(freeIndex)
    setBoard({ grid, freeIndex, n: size })
    setMarked(initialMarked)
  }, [text, size, freeSpace])

  // Redraw whenever the board or the marked cells change.
  useEffect(() => {
    draw(board, marked)
  }, [board, marked, draw])

  // Detect bingo. Recompute every completed line; if a line just became complete
  // that wasn't before, that's a new bingo — roll the dice for the foxy overlay.
  useEffect(() => {
    if (!board) return
    const nowKeys = new Set()
    let freshBingo = false
    for (const line of bingoLines(board.n)) {
      if (line.every((i) => marked.has(i))) {
        const key = line.join(',')
        nowKeys.add(key)
        if (!completedLines.current.has(key)) freshBingo = true
      }
    }
    completedLines.current = nowKeys
    if (freshBingo) {
      flash('BINGO! 🎉')
      // 1-in-10: fire the full-screen foxy overlay (a separate, monitor-wide window),
      // unless the user has disabled it in Settings.
      if (loadUiPref().jumpscare && Math.random() < JUMPSCARE_CHANCE) {
        window.api?.triggerJumpscare?.()
      }
    }
  }, [board, marked])

  // Draw an initial board on mount and whenever size/free toggles (if enough items).
  useEffect(() => {
    if (parseItems(text).length >= need) generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, freeSpace])

  // Toggle a mark on the clicked square.
  function handleCanvasClick(e) {
    const canvas = canvasRef.current
    if (!canvas || !board) return
    const rect = canvas.getBoundingClientRect()
    const px = ((e.clientX - rect.left) * canvas.width) / rect.width
    const py = ((e.clientY - rect.top) * canvas.height) / rect.height
    const { ox, oy, cellSize, n } = geometry(board.n)
    const col = Math.floor((px - ox) / cellSize)
    const row = Math.floor((py - oy) / cellSize)
    if (col < 0 || col >= n || row < 0 || row >= n || px < ox || py < oy) return
    const idx = row * n + col
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function addItem() {
    const v = addValue.trim()
    if (!v) return
    setText((t) => (t.replace(/\s*$/, '') + '\n' + v).replace(/^\n/, ''))
    setAddValue('')
  }

  function resetList() {
    if (confirm('Reset the bingo list to the default D2 LFG entries?')) {
      setText(DEFAULT_BINGO_ITEMS.join('\n'))
    }
  }

  async function copyImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        flash('Board copied to clipboard')
      } catch {
        flash('Copy failed — use Download instead', true)
      }
    })
  }

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `lfg-bingo-${size}x${size}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  return (
    <div className="bingo">
      <header className="bingo-header">
        <h2 className="bingo-heading">LFG Bingo</h2>
        <p className="bingo-subheading">
          Edit the list, pick a size, then generate a board. Click a square to mark it
          with an X; generating a new board clears your marks.
        </p>
      </header>

      <div className="bingo-grid">
        <section className="bingo-panel">
          <label className="bingo-label" htmlFor="bingo-items">
            Bingo items — one per line
          </label>
          <textarea
            id="bingo-items"
            className="bingo-textarea"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className={`bingo-count ${short ? 'is-warn' : ''}`}>
            {items.length} items
            {short && ` — need at least ${need} for ${size}×${size}`}
          </div>

          <div className="bingo-add-row">
            <input
              type="text"
              className="bingo-add-input"
              placeholder="Add an item…"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <button className="bingo-btn" onClick={addItem}>
              Add
            </button>
          </div>
          <button className="bingo-btn bingo-btn-ghost" onClick={resetList}>
            Reset to default list
          </button>
        </section>

        <section className="bingo-preview">
          <div className="bingo-controls">
            <div className="bingo-seg">
              <button
                className={size === 5 ? 'is-active' : ''}
                onClick={() => setSize(5)}
              >
                5 × 5
              </button>
              <button
                className={size === 7 ? 'is-active' : ''}
                onClick={() => setSize(7)}
              >
                7 × 7
              </button>
            </div>
            <label className="bingo-check">
              <input
                type="checkbox"
                checked={freeSpace}
                onChange={(e) => setFreeSpace(e.target.checked)}
              />
              Free centre space
            </label>
            <button className="bingo-btn bingo-btn-primary" onClick={generate}>
              Generate
            </button>
          </div>

          <div className="bingo-actions">
            <button className="bingo-btn" onClick={copyImage}>
              📋 Copy image
            </button>
            <button className="bingo-btn" onClick={download}>
              ⬇ Download PNG
            </button>
            <span className="bingo-hint">Uses {need} items per board.</span>
          </div>

          <div className="bingo-canvas-box">
            <canvas
              ref={canvasRef}
              className="bingo-canvas"
              width={830}
              height={894}
              onClick={handleCanvasClick}
              title="Click a square to mark it with an X"
            />
          </div>
        </section>
      </div>

      {toast && (
        <div className={`bingo-toast ${toast.isError ? 'is-error' : ''}`}>{toast.msg}</div>
      )}
    </div>
  )
}
