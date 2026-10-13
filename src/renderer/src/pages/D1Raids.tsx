import { useState } from 'react'
import { ActivitySection } from '../components/ActivityStats'
import { D1_RAIDS, d1RaidBg } from '../data/d1Raids'
import '../styles/activity.css'
import '../styles/library.css'

// Destiny 1 "Activities" pages — the four D1 raids (Normal / Prestige filter) and the strikes
// (Normal / Heroic / Nightfall filter), sharing one layout.
// D1 carnage reports have no "started from the beginning" flag, so there's no Full column;
// flawless = a completed run with zero team deaths.

const d1Cols = (topDifficulty, topLabel) => [
  { key: 'clears', label: 'Clears', popup: 'diff', src: 'clearsByDiff' },
  { key: topDifficulty, label: topLabel },
  { key: 'lowman', label: 'Low-man', popup: 'size', src: 'lowmanBySize' },
  { key: 'flawless', label: 'Flawless' }
]

const PAGES = {
  raid: {
    title: 'Raids',
    cls: 'tag-raid',
    topDifficulty: 'prestige',
    cols: d1Cols('prestige', 'Prestige'),
    lowmanMax: 3,
    columns: 2,
    // Always show all four raids, in release order, even with zero clears.
    rowNames: D1_RAIDS.map((r) => r.name),
    modes: [
      { id: 'all', label: 'All' },
      { id: 'normal', label: 'Normal' },
      { id: 'prestige', label: 'Prestige', title: 'Hard / Heroic / Age of Triumph 390 runs' }
    ]
  },
  strike: {
    title: 'Strikes',
    cls: 'tag-strike',
    topDifficulty: 'nightfall',
    cols: d1Cols('nightfall', 'Nightfall'),
    lowmanMax: 2,
    columns: 4,
    // No fixed strike list: only strikes that were played get a card.
    rowNames: [],
    modes: [
      { id: 'all', label: 'All' },
      { id: 'normal', label: 'Normal' },
      { id: 'heroic', label: 'Heroic' },
      { id: 'nightfall', label: 'Nightfall' }
    ]
  }
}

function computeD1Stats(activities, activityMode) {
  const { topDifficulty, lowmanMax, rowNames } = PAGES[activityMode]
  const bump = (obj, key) => {
    obj[key] = (obj[key] || 0) + 1
  }
  const blank = (name) => ({
    name,
    mode: activityMode,
    clears: 0,
    [topDifficulty]: 0,
    lowman: 0,
    flawless: 0,
    clearsByDiff: {},
    lowmanBySize: {},
    flawlessBySize: {}
  })
  const map = Object.fromEntries(rowNames.map((name) => [name, blank(name)]))
  for (const a of activities) {
    if (!a.completed) continue
    const m = (map[a.activityName] ||= blank(a.activityName))
    m.clears += 1
    bump(m.clearsByDiff, a.difficulty || 'normal')
    if (a.difficulty === topDifficulty) m[topDifficulty] += 1
    if (a.flawless) m.flawless += 1
    if (typeof a.playerCount === 'number' && a.playerCount > 0 && a.playerCount <= lowmanMax) {
      m.lowman += 1
      bump(m.lowmanBySize, a.playerCount)
      if (a.flawless) bump(m.flawlessBySize, a.playerCount)
    }
  }
  const rows = Object.values(map) as any[]
  if (rowNames.length === 0) rows.sort((a, b) => a.name.localeCompare(b.name))
  const totalKeys = ['clears', topDifficulty, 'lowman', 'flawless']
  const totals: any = { clearsByDiff: {}, lowmanBySize: {} }
  for (const k of totalKeys) totals[k] = 0
  for (const r of rows) {
    for (const k of totalKeys) totals[k] += r[k]
    for (const src of ['clearsByDiff', 'lowmanBySize'])
      for (const k in r[src]) totals[src][k] = (totals[src][k] || 0) + r[src][k]
  }
  return { rows, totals }
}

// Fastest completed run matching a badge (Flawless / Solo / Duo / Trio).
function fastestRun(activities, name, badge) {
  const size = { Solo: 1, Duo: 2, Trio: 3 }[badge]
  let best = null
  for (const a of activities) {
    if (!a.completed || a.activityName !== name) continue
    if (badge === 'Flawless' ? !a.flawless : a.playerCount !== size) continue
    if (!best || a.durationSeconds < best.durationSeconds) best = a
  }
  return best
}

export default function D1Raids({
  activities = [],
  state = 'idle',
  error = '',
  onOpenRun,
  activityMode = 'raid'
}) {
  const [mode, setMode] = useState('all')
  const page = PAGES[activityMode]
  const ofActivityMode = activities.filter((a) => a.mode === activityMode)
  const filtered = mode === 'all' ? ofActivityMode : ofActivityMode.filter((a) => a.difficulty === mode)
  const stats = state === 'done' ? computeD1Stats(filtered, activityMode) : null
  const modeLabel = page.modes.find((m) => m.id === mode)?.label

  return (
    <section className="library-main">
      {state === 'loading' && (
        <div className="activity-status">
          <span className="spinner" /> Loading your Destiny 1 raids and strikes and their reports…
          (first load can take a few minutes)
        </div>
      )}
      {state === 'error' && (
        <div className="activity-status is-error">Couldn’t load D1 activities: {error}</div>
      )}

      {stats && (
        <>
          <div className="run-filter-chips d1-mode-chips">
            {page.modes.map((m: any) => (
              <button
                key={m.id}
                className={`run-chip ${mode === m.id ? 'is-active' : ''}`}
                onClick={() => setMode(m.id)}
                title={m.title}
              >
                {m.label}
              </button>
            ))}
          </div>
          <ActivitySection
            title={mode === 'all' ? page.title : `${page.title} · ${modeLabel}`}
            cls={page.cls}
            totals={stats.totals}
            rows={stats.rows}
            cols={page.cols}
            columns={page.columns}
            resolveBg={(name) =>
              d1RaidBg(name) || ofActivityMode.find((a) => a.activityName === name)?.bg
            }
            onBadge={(row, badge) => {
              const run = fastestRun(filtered, row.name, badge)
              if (run) onOpenRun?.(run.instanceId)
            }}
          />
        </>
      )}
    </section>
  )
}
