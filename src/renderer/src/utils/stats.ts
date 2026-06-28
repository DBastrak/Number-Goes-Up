// Aggregate counters computed from the enriched activity list.
//
//   Total clears = Bungie's authoritative `activitiesCleared` aggregate (`totals`),
//                  falling back to the enumerated finished count if unavailable.
//   Full clears  = of the finished activities we enumerated, the ones that STARTED
//                  FRESH (freshness only exists per-PGCR, so this must be enumerated).
// Per-class clear stats. `characterClasses` maps characterId -> class name.
// Returns one row per class that has clears: { class, raidClears, raidFull, dungeonClears, dungeonFull }.
const CLASS_ORDER = ['Titan', 'Hunter', 'Warlock']

export function computeClassStats(activities, characterClasses = {}) {
    const rows: Record<
        string,
        { class: string; raidClears: number; raidFull: number; dungeonClears: number; dungeonFull: number }
    > = {}
    const get = (cls) =>
        (rows[cls] = rows[cls] || { class: cls, raidClears: 0, raidFull: 0, dungeonClears: 0, dungeonFull: 0 })

    // Always show the three classes, even with zero clears.
    for (const cls of CLASS_ORDER) get(cls)

    for (const a of activities) {
        if (!a.completed) continue
        const cls = a.className || characterClasses[a.characterId] || 'Unknown'
        const row = get(cls)
        if (a.mode === 'raid') {
            row.raidClears += 1
            if (a.fresh) row.raidFull += 1
        } else if (a.mode === 'dungeon') {
            row.dungeonClears += 1
            if (a.fresh) row.dungeonFull += 1
        }
    }

    // Drop an Unknown row only when it has no clears.
    return Object.values(rows)
        .filter((r) => CLASS_ORDER.includes(r.class) || r.raidClears + r.dungeonClears > 0)
        .sort((x, y) => {
            const ix = CLASS_ORDER.indexOf(x.class)
            const iy = CLASS_ORDER.indexOf(y.class)
            return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy)
        })
}

// Bungie only tracked the "started fresh" flag reliably from ~mid-2022. Before that we
// estimate freshness from startingPhaseIndex, so we split full clears into the portion
// Bungie's flag CONFIRMS vs the pre-2022 ESTIMATE (kept in sync with main/stats.js).
const FLAG_RELIABLE_FROM = Date.parse('2022-07-01T00:00:00Z')
const isModern = (a) => a.period && Date.parse(a.period) >= FLAG_RELIABLE_FROM

export function computeStats(activities, totals) {
    const finished = (mode) => activities.filter((a) => a.mode === mode && a.completed)
    const count = (arr, pred) => arr.filter(pred).length

    const raids = finished('raid')
    const dungeons = finished('dungeon')

    const fullStats = (arr) => ({
        full: count(arr, (a) => a.fresh),
        fullConfirmed: count(arr, (a) => a.fresh && isModern(a)),
        fullLegacy: count(arr, (a) => a.fresh && !isModern(a))
    })

    return {
        raid: {
            total: totals?.raid ?? raids.length, // Bungie aggregate
            enumerated: raids.length,
            ...fullStats(raids), // finished AND started fresh (+ confirmed/legacy split)
            p3: count(raids, (a) => a.playerCount === 3),
            p2: count(raids, (a) => a.playerCount === 2),
            p1: count(raids, (a) => a.playerCount === 1),
            flawless: count(raids, (a) => a.flawless)
        },
        dungeon: {
            total: totals?.dungeon ?? dungeons.length, // Bungie aggregate
            enumerated: dungeons.length,
            ...fullStats(dungeons),
            solo: count(dungeons, (a) => a.playerCount === 1),
            flawless: count(dungeons, (a) => a.flawless),
            soloFlawless: count(dungeons, (a) => a.playerCount === 1 && a.flawless)
        }
    }
}