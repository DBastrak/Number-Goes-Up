// Destiny 2 stats — character ids, activity history, and PGCR details.
//
// Endpoints (all send X-API-Key):
//   Destiny2/{type}/Account/{id}/Stats/ .................................. character ids
//   Destiny2/{type}/Account/{id}/Character/{cid}/Stats/Activities/ ........ activity history (paged)
//   Destiny2/Stats/PostGameCarnageReport/{instanceId}/ (stats.bungie.net) . full carnage report

import { bungieGet } from './client'
import { describeActivity } from './activityNames'

const BASE = 'https://www.bungie.net/Platform'
const STATS_BASE = 'https://stats.bungie.net/Platform'
const PAGE_COUNT = 250
const MODES = ['raid', 'dungeon']

// Pull a nested Destiny stat value: values.kills.basic.value
function statValue(values, key) {
  return values?.[key]?.basic?.value
}

// Bungie only began reliably populating `activityWasStartedFromBeginning` around
// mid-2022; before that it is `false` even for genuine fresh runs. So for legacy
// activities we fall back to `startingPhaseIndex === 0`, and for modern ones we
// trust the flag (which correctly excludes checkpoint farms that began at phase 0).
const FLAG_RELIABLE_FROM = Date.parse('2022-07-01T00:00:00Z')

export function isFreshClear({ period, activityWasStartedFromBeginning, startingPhaseIndex }) {
  if (period && Date.parse(period) >= FLAG_RELIABLE_FROM) {
    return activityWasStartedFromBeginning === true
  }
  return startingPhaseIndex === 0
}

// --- 1. Characters for an account (INCLUDING deleted ones) ---
// Bungie lists deleted characters in `characters` with `deleted: true`; their
// activity history and clear stats are still queryable, so we keep all of them.
export async function getCharacters(membershipType, membershipId) {
  const { body } = await bungieGet(`${BASE}/Destiny2/${membershipType}/Account/${membershipId}/Stats/`)
  const characters = body?.Response?.characters || []
  const list = characters.map((c) => ({ characterId: c.characterId, deleted: !!c.deleted }))
  const deleted = list.filter((c) => c.deleted).length
  console.log(
    `[stats] characters: ${list.length} (${deleted} deleted, ${list.length - deleted} active) — all included`
  )
  return list
}

// Backwards-compatible helper returning just the ids of every character.
export async function getCharacterIds(membershipType, membershipId) {
  return (await getCharacters(membershipType, membershipId)).map((c) => c.characterId)
}

// Authoritative clear totals from Bungie's historical stats (matches Bungie's own
// numbers, includes deleted characters, and isn't affected by activity-history paging).
export async function getClearTotals(membershipType, membershipId, characterIds) {
  let raid = 0
  let dungeon = 0
  for (const characterId of characterIds) {
    const { body } = await bungieGet(
      `${BASE}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/?modes=4,82`
    )
    raid += body?.Response?.raid?.allTime?.activitiesCleared?.basic?.value || 0
    dungeon += body?.Response?.dungeon?.allTime?.activitiesCleared?.basic?.value || 0
  }
  return { raid, dungeon }
}

// Bungie privacy error codes. 1665 = DestinyPrivacyRestriction (account hides its stats).
const PRIVACY_CODES = new Set([1665])
export function isPrivacyError(body) {
  return PRIVACY_CODES.has(body?.ErrorCode) || /privacy/i.test(body?.ErrorStatus || '')
}
export function privacyError() {
  const err = new Error("This Guardian's account is private — their stats aren't shared.") as Error & {
    code?: string
  }
  err.code = 'PRIVATE'
  return err
}

// Resolve character ids while surfacing privacy restrictions as a tagged error so the
// UI can show a clear "private account" message instead of zeros or a cryptic failure.
async function getReadableCharacterIds(membershipType, membershipId) {
  const { body } = await bungieGet(
    `${BASE}/Destiny2/${membershipType}/Account/${membershipId}/Stats/`
  )
  if (isPrivacyError(body)) throw privacyError()
  if (body?.ErrorCode && body.ErrorCode !== 1) {
    throw new Error(body.ErrorStatus || body.Message || `Bungie error ${body.ErrorCode}`)
  }
  return (body?.Response?.characters || []).map((c) => c.characterId)
}

// Overall (Bungie-authoritative) clear totals for any account — used for followed users.
export async function getUserStats(membershipType, membershipId) {
  const characterIds = await getReadableCharacterIds(membershipType, membershipId)
  const totals = await getClearTotals(membershipType, membershipId, characterIds)
  return { raid: totals.raid || 0, dungeon: totals.dungeon || 0, characters: characterIds.length }
}

// Per-raid / per-dungeon clear counts for any account, by enumerating their activity
// history (AggregateActivityStats is unreliable / 500s, so we count completions here).
export async function getUserBreakdown(membershipType, membershipId) {
  const characterIds = await getReadableCharacterIds(membershipType, membershipId)
  const map: Record<string, { name: string; mode: string; clears: number }> = {} // name -> { name, mode, clears }
  const seen = new Set() // dedupe instances so nothing is counted twice
  for (const characterId of characterIds) {
    for (const mode of MODES) {
      const list = await getCharacterActivities(membershipType, membershipId, characterId, mode)
      for (const a of list) {
        if (!a.completed) continue
        if (a.instanceId) {
          if (seen.has(a.instanceId)) continue
          seen.add(a.instanceId)
        }
        const key = a.activityName
        if (!map[key]) map[key] = { name: key, mode, clears: 0 }
        map[key].clears += 1
      }
    }
  }
  const all = Object.values(map)
  const raids = all.filter((x) => x.mode === 'raid').sort((a, b) => b.clears - a.clears)
  const dungeons = all.filter((x) => x.mode === 'dungeon').sort((a, b) => b.clears - a.clears)
  return {
    raids,
    dungeons,
    raid: raids.reduce((s, x) => s + x.clears, 0),
    dungeon: dungeons.reduce((s, x) => s + x.clears, 0)
  }
}

// Detailed per-activity stats for any account: clears, full (fresh) clears, low-mans, and
// flawless clears — plus per-mode totals. clears + low-man come from the activity history
// (low-man = raids with ≤3 players / dungeons soloed with 1); full + flawless come from the
// PGCR, enriched via the shared cache (so repeat views and overlap with your own runs are
// cheap). Used by the Following profile grids.
export async function getUserActivityStats(membershipType, membershipId, cache = {}) {
  const characterIds = await getReadableCharacterIds(membershipType, membershipId)
  const completed = []
  const seen = new Set()
  for (const characterId of characterIds) {
    const lists = [
      ...(await Promise.all(
        MODES.map((mode) => getCharacterActivities(membershipType, membershipId, characterId, mode))
      )),
      // Recover pre-Dungeon-mode Shattered Throne runs (filed under Story).
      await getLegacyShatteredThrone(membershipType, membershipId, characterId)
    ]
    for (const list of lists) {
      for (const a of list) {
        if (!a.completed) continue
        if (a.instanceId) {
          if (seen.has(a.instanceId)) continue
          seen.add(a.instanceId)
        }
        completed.push(a)
      }
    }
  }

  // Fill in fresh + flawless from each run's PGCR (cached by instanceId).
  await enrichActivities(completed, cache)

  type Row = { name: string; mode: string; clears: number; full: number; lowman: number; flawless: number }
  const map: Record<string, Row> = {}
  for (const a of completed) {
    const m = (map[a.activityName] ||= {
      name: a.activityName,
      mode: a.mode,
      clears: 0,
      full: 0,
      lowman: 0,
      flawless: 0
    })
    m.clears += 1
    if (a.fresh) m.full += 1
    if (a.flawless) m.flawless += 1
    const threshold = a.mode === 'raid' ? 3 : 1 // raid low-man = ≤3, dungeon solo = 1
    if (typeof a.playerCount === 'number' && a.playerCount > 0 && a.playerCount <= threshold) {
      m.lowman += 1
    }
  }

  const all = Object.values(map)
  const raids = all.filter((x) => x.mode === 'raid').sort((a, b) => b.clears - a.clears)
  const dungeons = all.filter((x) => x.mode === 'dungeon').sort((a, b) => b.clears - a.clears)
  const totals = (arr: Row[]) => ({
    clears: arr.reduce((s, x) => s + x.clears, 0),
    full: arr.reduce((s, x) => s + x.full, 0),
    lowman: arr.reduce((s, x) => s + x.lowman, 0),
    flawless: arr.reduce((s, x) => s + x.flawless, 0)
  })
  return { raids, dungeons, raidTotals: totals(raids), dungeonTotals: totals(dungeons) }
}

// Lightweight: completed raid/dungeon runs since `sinceISO` (one recent page per
// character + mode), newest first. Used to detect new clears for followed users.
export async function getRecentCompletions(membershipType, membershipId, sinceISO, perPage = 30) {
  const since = sinceISO ? Date.parse(sinceISO) : 0
  const characterIds = await getCharacterIds(membershipType, membershipId)
  const out = []
  for (const characterId of characterIds) {
    for (const mode of MODES) {
      const url =
        `${BASE}/Destiny2/${membershipType}/Account/${membershipId}` +
        `/Character/${characterId}/Stats/Activities/?page=0&mode=${mode}&count=${perPage}`
      const { body } = await bungieGet(url)
      for (const a of body?.Response?.activities || []) {
        if (statValue(a.values || {}, 'completed') !== 1) continue
        const t = Date.parse(a.period)
        if (!(t > since)) continue
        const info = describeActivity(a.activityDetails?.referenceId, mode)
        out.push({
          mode,
          activityName: info.name,
          difficulty: info.difficulty,
          period: a.period,
          instanceId: a.activityDetails?.instanceId
        })
      }
    }
  }
  out.sort((x, y) => y.period.localeCompare(x.period))
  return out
}

// Count only FULL clears (started from the beginning, not a checkpoint) since `sinceISO`.
// Freshness isn't in the activity-history list, so it's read from each run's PGCR and
// cached per instance for the app session (today's runs are few + repeated polls reuse it).
const freshClearCache = new Map<string, boolean>()
export async function getFullClearCount(membershipType, membershipId, sinceISO) {
  const completions = await getRecentCompletions(membershipType, membershipId, sinceISO)
  let count = 0
  await mapPool(completions, 4, async (c) => {
    if (!c.instanceId) return
    let fresh = freshClearCache.get(c.instanceId)
    if (fresh === undefined) {
      try {
        const pgcr = await getPostGameCarnageReport(c.instanceId)
        fresh = !!pgcr?.fresh
        freshClearCache.set(c.instanceId, fresh)
      } catch {
        fresh = false // can't verify -> don't count it as a full clear
      }
    }
    if (fresh) count += 1
  })
  return count
}

// Map each characterId -> Guardian class. Current characters come from the profile
// (one request); deleted characters that still have clears are filled in from a single
// PGCR each (cheap — usually 0–1 of them).
const CLASS_BY_TYPE = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }

export async function getCharacterClasses(membershipType, membershipId, activities) {
  const classes: Record<string, string> = {}

  const { body } = await bungieGet(
    `${BASE}/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`
  )
  const chars = body?.Response?.characters?.data || {}
  for (const [characterId, c] of Object.entries<any>(chars)) {
    classes[characterId] = CLASS_BY_TYPE[c.classType] ?? 'Unknown'
  }

  // Fill any character that has clears but no class yet (deleted characters).
  const need = new Set<string>()
  for (const a of activities) {
    if (a.completed && a.characterId && !classes[a.characterId]) need.add(a.characterId)
  }
  for (const characterId of need) {
    const inst = activities.find(
      (a) => a.characterId === characterId && a.completed && a.instanceId
    )?.instanceId
    if (!inst) continue
    try {
      const pgcr = await getPostGameCarnageReport(inst)
      const entry = pgcr?.players?.find((p) => p.characterId === characterId)
      if (entry?.className) classes[characterId] = entry.className
    } catch {
      /* leave unknown */
    }
  }

  return classes
}

// --- 2 & 3. Activity history for one character + mode, paged until a short page ---
export async function getCharacterActivities(membershipType, membershipId, characterId, mode) {
  const all = []
  const seen = new Set() // guard against the same instance appearing on two pages
  let page = 0

  // Keep paging while a full page (count === PAGE_COUNT) comes back.
  // Stop once a SUCCESSFUL response returns fewer than the count. A throttled/errored
  // page must not be treated as "the end" — that would silently truncate history.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url =
      `${BASE}/Destiny2/${membershipType}/Account/${membershipId}` +
      `/Character/${characterId}/Stats/Activities/?page=${page}&mode=${mode}&count=${PAGE_COUNT}`
    const { body } = await bungieGet(url)

    // ErrorCode 1 = Success. Anything else after the client's retries is a real failure;
    // throw rather than undercount. Privacy restrictions get a friendly tagged error.
    if (isPrivacyError(body)) throw privacyError()
    if (body?.ErrorCode && body.ErrorCode !== 1) {
      throw new Error(
        `Activity history failed (char ${characterId}, mode ${mode}, page ${page}): ` +
          `${body.ErrorStatus || body.Message || body.ErrorCode}`
      )
    }

    const activities = body?.Response?.activities || []

    for (const a of activities) {
      const details = a.activityDetails || {}
      const values = a.values || {}
      // Skip an instance we've already recorded (page-boundary overlap).
      if (details.instanceId) {
        if (seen.has(details.instanceId)) continue
        seen.add(details.instanceId)
      }
      // Map the referenceId hash -> human name + difficulty via the manifest table.
      const info = describeActivity(details.referenceId, mode)
      all.push({
        mode,
        characterId,
        instanceId: details.instanceId,
        referenceId: details.referenceId,
        directorActivityHash: details.directorActivityHash,
        activityMode: details.mode,
        activityName: info.name,
        difficulty: info.difficulty,
        period: a.period,
        completed: statValue(values, 'completed') === 1,
        completionReason: statValue(values, 'completionReason'),
        durationSeconds: statValue(values, 'activityDurationSeconds'),
        kills: statValue(values, 'kills'),
        deaths: statValue(values, 'deaths'),
        assists: statValue(values, 'assists'),
        playerCount: statValue(values, 'playerCount')
      })
    }

    if (activities.length < PAGE_COUNT) break
    page += 1
  }

  return all
}

// --- Legacy Shattered Throne (pre-Dungeon-mode) ---
// The Shattered Throne launched in 2018, before Bungie added the Dungeon activity mode (82)
// in late 2019, so its early runs are filed under Story (mode 2) and the normal dungeon
// query misses them. Scan Story history and recover Shattered Throne clears, tagging them as
// dungeon so they count. Story history is small, and we stop paging once we've gone past the
// Shattered Throne's release (history is newest-first, so no older runs can be its).
const SHATTERED_THRONE_RELEASE = Date.parse('2018-08-01T00:00:00Z')
export async function getLegacyShatteredThrone(membershipType, membershipId, characterId) {
  const all = []
  const seen = new Set()
  let page = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url =
      `${BASE}/Destiny2/${membershipType}/Account/${membershipId}` +
      `/Character/${characterId}/Stats/Activities/?page=${page}&mode=story&count=${PAGE_COUNT}`
    const { body } = await bungieGet(url)
    if (isPrivacyError(body)) throw privacyError()
    if (body?.ErrorCode && body.ErrorCode !== 1) {
      throw new Error(
        `Legacy story history failed (char ${characterId}, page ${page}): ` +
          `${body.ErrorStatus || body.Message || body.ErrorCode}`
      )
    }

    const activities = body?.Response?.activities || []
    for (const a of activities) {
      const details = a.activityDetails || {}
      // Only Shattered Throne runs (by mapped name) — skip the rest of Story history.
      const info = describeActivity(details.referenceId, 'dungeon')
      if (info.name !== 'The Shattered Throne') continue
      if (details.instanceId) {
        if (seen.has(details.instanceId)) continue
        seen.add(details.instanceId)
      }
      const values = a.values || {}
      all.push({
        mode: 'dungeon',
        characterId,
        instanceId: details.instanceId,
        referenceId: details.referenceId,
        directorActivityHash: details.directorActivityHash,
        activityMode: details.mode,
        activityName: info.name,
        difficulty: info.difficulty,
        period: a.period,
        completed: statValue(values, 'completed') === 1,
        completionReason: statValue(values, 'completionReason'),
        durationSeconds: statValue(values, 'activityDurationSeconds'),
        kills: statValue(values, 'kills'),
        deaths: statValue(values, 'deaths'),
        assists: statValue(values, 'assists'),
        playerCount: statValue(values, 'playerCount')
      })
    }

    if (activities.length < PAGE_COUNT) break
    const oldest = activities[activities.length - 1]?.period
    if (oldest && Date.parse(oldest) < SHATTERED_THRONE_RELEASE) break
    page += 1
  }

  return all
}

// Load all raid + dungeon activities across every character on the account.
export async function loadAllActivities(session) {
  const membershipType = session.membershipType
  const membershipId = session.primaryMembershipId

  // Includes deleted characters — their clears count too.
  const characters = await getCharacters(membershipType, membershipId)
  const characterIds = characters.map((c) => c.characterId)
  const collected = []

  for (const character of characters) {
    for (const mode of MODES) {
      const list = await getCharacterActivities(
        membershipType,
        membershipId,
        character.characterId,
        mode
      )
      // Tag each activity with whether its character is deleted (for transparency).
      for (const a of list) a.characterDeleted = character.deleted
      collected.push(...list)
    }
    // Recover pre-Dungeon-mode Shattered Throne runs (filed under Story).
    const legacy = await getLegacyShatteredThrone(membershipType, membershipId, character.characterId)
    for (const a of legacy) a.characterDeleted = character.deleted
    collected.push(...legacy)
  }

  // Defense-in-depth: dedupe by globally-unique instanceId so no run is counted twice
  // (an activity instance belongs to exactly one character + mode, so this only removes
  // true duplicates, never distinct clears).
  const byInstance = new Map()
  for (const a of collected) {
    const key = a.instanceId || `${a.characterId}:${a.referenceId}:${a.period}`
    if (!byInstance.has(key)) byInstance.set(key, a)
  }
  const activities = [...byInstance.values()]
  if (activities.length !== collected.length) {
    console.log(`[stats] deduped ${collected.length - activities.length} duplicate activity rows`)
  }

  // Newest first.
  activities.sort((a, b) => +new Date(b.period) - +new Date(a.period))

  // Per-activity breakdown of finished clears, keyed by referenceId — lets us compare
  // against per-raid / per-dungeon numbers on sites like raid.report / dungeon.report.
  const breakdown = { raid: {}, dungeon: {} }
  const perCharacter = {}
  // Human-readable rollup keyed by "mode | name | difficulty" — completed clears,
  // so raids/dungeons and their master vs normal variants are split out by name.
  const byActivity: Record<string, { mode: string; name: string; difficulty: string; clears: number }> = {}
  for (const a of activities) {
    if (!a.completed) continue
    const bucket = breakdown[a.mode]
    if (bucket) bucket[a.referenceId] = (bucket[a.referenceId] || 0) + 1
    perCharacter[a.characterId] = perCharacter[a.characterId] || { raid: 0, dungeon: 0 }
    perCharacter[a.characterId][a.mode] += 1

    const key = `${a.mode}|${a.activityName}|${a.difficulty}`
    if (!byActivity[key]) {
      byActivity[key] = {
        mode: a.mode,
        name: a.activityName,
        difficulty: a.difficulty,
        clears: 0
      }
    }
    byActivity[key].clears += 1
  }
  // Newest-friendly: sort the rollup by mode then clears desc.
  const activitySummary = Object.values(byActivity).sort(
    (x, y) => x.mode.localeCompare(y.mode) || y.clears - x.clears
  )

  // Authoritative clear totals (Bungie's own stat) summed across every character.
  const totals = await getClearTotals(membershipType, membershipId, characterIds)
  console.log('[stats] finished clears by referenceId:', JSON.stringify(breakdown))

  // characterId -> Guardian class, for per-class stats.
  const characterClasses = await getCharacterClasses(membershipType, membershipId, activities)
  // Tag each activity with its class so the renderer doesn't depend on the map.
  for (const a of activities) a.className = characterClasses[a.characterId] || 'Unknown'
  console.log('[stats] character classes:', JSON.stringify(characterClasses))

  return {
    membershipType,
    membershipId,
    characters,
    characterIds,
    characterClasses,
    charactersMeta: {
      total: characters.length,
      deleted: characters.filter((c) => c.deleted).length,
      active: characters.filter((c) => !c.deleted).length
    },
    activities,
    totals,
    breakdown,
    activitySummary,
    perCharacter,
    loadedAt: new Date().toISOString()
  }
}

// --- 4. Post Game Carnage Report for a single activity instance ---
export async function getPostGameCarnageReport(instanceId) {
  const { body } = await bungieGet(`${STATS_BASE}/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`)
  const r = body?.Response
  if (!r) return null

  const players = (r.entries || []).map((e) => {
    const info = e.player?.destinyUserInfo || {}
    const code = String(info.bungieGlobalDisplayNameCode ?? '').padStart(4, '0')
    const values = e.values || {}
    return {
      name: info.bungieGlobalDisplayName ? `${info.bungieGlobalDisplayName}#${code}` : info.displayName,
      membershipId: info.membershipId,
      characterId: e.characterId,
      emblem: info.iconPath ? `https://www.bungie.net${info.iconPath}` : null,
      className: e.player?.characterClass || '',
      completed: statValue(values, 'completed') === 1,
      kills: statValue(values, 'kills'),
      deaths: statValue(values, 'deaths'),
      assists: statValue(values, 'assists'),
      kd: statValue(values, 'killsDeathsRatio'),
      score: statValue(values, 'score'),
      timePlayedSeconds: statValue(values, 'timePlayedSeconds')
    }
  })

  const teamDeaths = players.reduce((sum, p) => sum + (p.deaths || 0), 0)
  const period = r.period
  const activityWasStartedFromBeginning = r.activityWasStartedFromBeginning ?? null
  const startingPhaseIndex = r.startingPhaseIndex ?? null

  // 4 = Raid, 82 = Dungeon (the modes this app queries).
  const mode = r.activityDetails?.mode === 4 ? 'raid' : r.activityDetails?.mode === 82 ? 'dungeon' : null
  const info = describeActivity(r.activityDetails?.referenceId, mode)

  return {
    instanceId,
    period,
    referenceId: r.activityDetails?.referenceId,
    directorActivityHash: r.activityDetails?.directorActivityHash,
    activityMode: r.activityDetails?.mode,
    mode,
    activityName: info.name,
    difficulty: info.difficulty,
    durationSeconds: statValue(r.entries?.[0]?.values, 'activityDurationSeconds'),
    // Raw freshness inputs (cached) + the derived flag.
    activityWasStartedFromBeginning,
    startingPhaseIndex,
    fresh: isFreshClear({ period, activityWasStartedFromBeginning, startingPhaseIndex }),
    teamDeaths,
    flawless: teamDeaths === 0,
    players
  }
}

// Run an async fn over items with limited concurrency.
async function mapPool(items, limit, fn) {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

// Enrich completed activities with PGCR-derived fields (fresh / teamDeaths / flawless) +
// the fireteam's Guardian names (for "search by player" in Recent Runs).
// `cache` maps instanceId -> { flag, spi, period, teamDeaths, players } and is mutated for
// reuse. Entries cached before player-name support get re-fetched once to backfill names.
export async function enrichActivities(activities, cache = {}) {
  const targets = activities.filter((a) => a.completed && a.instanceId)
  let fetched = 0
  let failed = 0

  // Apply a cache record (raw freshness inputs + player names) to an activity.
  const apply = (a, rec) => {
    a.teamDeaths = rec.teamDeaths
    a.flawless = rec.teamDeaths === 0
    a.fresh = isFreshClear({
      period: rec.period || a.period,
      activityWasStartedFromBeginning: rec.flag,
      startingPhaseIndex: rec.spi
    })
    if (rec.players) a.players = rec.players
  }

  // Apply whatever's cached, then fetch anything missing — including older cache entries
  // that predate player names (so the names get backfilled on the next load).
  const toFetch = []
  for (const a of targets) {
    const hit = cache[a.instanceId]
    if (hit) {
      apply(a, hit)
      if (!hit.players) toFetch.push(a)
    } else {
      toFetch.push(a)
    }
  }

  await mapPool(toFetch, 4, async (a) => {
    try {
      const r = await getPostGameCarnageReport(a.instanceId)
      if (!r) {
        failed += 1
        return
      }
      const rec = {
        flag: r.activityWasStartedFromBeginning,
        spi: r.startingPhaseIndex,
        period: r.period,
        teamDeaths: r.teamDeaths,
        players: (r.players || []).map((p) => p.name).filter(Boolean)
      }
      cache[a.instanceId] = rec
      apply(a, rec)
      fetched += 1
    } catch {
      // Don't cache — a later load retries this instance.
      failed += 1
    }
  })

  return { fetched, failed, total: targets.length }
}
