import { ACTIVITY_DEFS, resolveDef, CHALLENGE_DIFFICULTIES } from '../data/activityDefs'

// Speed badge: devil (👿) if below target, running man (🏃) if within 5 min over target.
export function getSpeedBadge(activityName, durationSeconds) {
    const def = resolveDef(activityName)
    // resolveDef returns null for activities with no benchmark (e.g. Pantheon) — no badge.
    if (!def?.targetSeconds || !durationSeconds) return null
    const overTarget = durationSeconds - def.targetSeconds
    const underTarget = durationSeconds - def.targetSeconds
    if (underTarget < -120) return { icon: '🥶', label: 'speed demon', seconds: overTarget }
    if (overTarget < 0) return { icon: '👿', label: 'speedy boi', seconds: overTarget }
    if (overTarget <= 300) return { icon: '🏃', label: 'faster than an avg lfg', seconds: overTarget }
    return null
}

// Is this finished clear a "challenge" clear (flag 2)?
export function isChallengeClear(activity) {
    return CHALLENGE_DIFFICULTIES.has(activity.difficulty)
}

// Is this finished clear a "day-one" clear (flag 1)?
//   - any "contest" difficulty activity, OR
//   - completed within releaseDate + dayOneHours of the def.
export function isDayOneClear(def, activity) {
    if (activity.difficulty === 'contest') return true
    if (!def.dayOneHours || !def.releaseDate || !activity.period) return false
    const start = Date.parse(def.releaseDate)
    const end = start + def.dayOneHours * 3600 * 1000
    const t = Date.parse(activity.period)
    return t >= start && t <= end
}

// Aggregate finished clears against the raid/dungeon definitions.
// Returns one row per def (incl. zero-clear ones) plus any unmatched activity names.
export function matchActivities(activities) {
    const rows = new Map()
    for (const def of ACTIVITY_DEFS) {
        rows.set(def.name, {
            def,
            total: 0,
            full: 0,
            dayOne: 0,
            challenge: 0,
            byDifficulty: {},
            lastCleared: null
        })
    }

    const unmatched = {} // activityName -> { count, mode, referenceId }

    for (const a of activities) {
        if (!a.completed) continue
        const def = resolveDef(a.activityName)
        if (!def) {
            const key = a.activityName || `ref ${a.referenceId}`
            if (!unmatched[key]) unmatched[key] = { count: 0, mode: a.mode, referenceId: a.referenceId }
            unmatched[key].count += 1
            continue
        }

        const row = rows.get(def.name)
        row.total += 1
        if (a.fresh) row.full += 1
        if (isChallengeClear(a)) row.challenge += 1
        if (isDayOneClear(def, a)) row.dayOne += 1
        const diff = a.difficulty || 'normal'
        row.byDifficulty[diff] = (row.byDifficulty[diff] || 0) + 1
        if (!row.lastCleared || a.period > row.lastCleared) row.lastCleared = a.period
    }

    const all = [...rows.values()]
    return {
        raids: all.filter((r) => r.def.type === 'raid'),
        dungeons: all.filter((r) => r.def.type === 'dungeon'),
        unmatched: Object.entries<any>(unmatched)
            .map(([name, info]) => ({ name, ...info }))
            .sort((a, b) => b.count - a.count)
    }
}