// Renderer-side equivalent of the main process's getUserActivityStats — builds per-activity
// raid/dungeon stats (clears / full / low-man / flawless + the hover-popup sub-breakdowns)
// from the logged-in account's already-loaded + enriched activities array. Used by the
// Activities (Library) tab so it can show the same totals bar + card grid as Following.
export function computeActivityStats(activities = []) {
  const bump = (obj, key) => {
    obj[key] = (obj[key] || 0) + 1
  }
  const map = {}
  for (const a of activities) {
    if (!a.completed) continue
    if (a.mode !== 'raid' && a.mode !== 'dungeon') continue
    const m = (map[a.activityName] ||= {
      name: a.activityName,
      mode: a.mode,
      clears: 0,
      full: 0,
      lowman: 0,
      flawless: 0,
      clearsByDiff: {},
      fullByDiff: {},
      lowmanBySize: {}
    })
    const diff = a.difficulty || 'normal'
    m.clears += 1
    bump(m.clearsByDiff, diff)
    if (a.fresh) {
      m.full += 1
      bump(m.fullByDiff, diff)
    }
    if (a.flawless) m.flawless += 1
    const threshold = a.mode === 'raid' ? 3 : 1 // raid low-man = ≤3, dungeon solo = 1
    if (typeof a.playerCount === 'number' && a.playerCount > 0 && a.playerCount <= threshold) {
      m.lowman += 1
      bump(m.lowmanBySize, a.playerCount)
    }
  }

  const all = Object.values(map) as any[]
  // Pantheon activities are mode 'raid' but get their own section.
  const isPantheon = (n) => n.startsWith('Pantheon:') || n.startsWith('The Pantheon:')
  const byClears = (a, b) => b.clears - a.clears
  const raids = all.filter((x) => x.mode === 'raid' && !isPantheon(x.name)).sort(byClears)
  const pantheon = all.filter((x) => isPantheon(x.name)).sort(byClears)
  const dungeons = all.filter((x) => x.mode === 'dungeon').sort(byClears)
  const mergeInto = (target, src) => {
    for (const k in src) target[k] = (target[k] || 0) + src[k]
  }
  const totals = (arr) => {
    const t = {
      clears: 0,
      full: 0,
      lowman: 0,
      flawless: 0,
      clearsByDiff: {},
      fullByDiff: {},
      lowmanBySize: {}
    }
    for (const x of arr) {
      t.clears += x.clears
      t.full += x.full
      t.lowman += x.lowman
      t.flawless += x.flawless
      mergeInto(t.clearsByDiff, x.clearsByDiff)
      mergeInto(t.fullByDiff, x.fullByDiff)
      mergeInto(t.lowmanBySize, x.lowmanBySize)
    }
    return t
  }
  return {
    raids,
    dungeons,
    pantheon,
    raidTotals: totals(raids),
    dungeonTotals: totals(dungeons),
    pantheonTotals: totals(pantheon)
  }
}
