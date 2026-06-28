// Live activity — is the player currently in an activity, and if so what / with whom.
//
// Uses the Profile endpoint with components:
//   100 profiles            -> dateLastPlayed (online heuristic)
//   200 characters          -> class of the active character
//   204 characterActivities -> currentActivityHash + dateActivityStarted (the timer)
//   205 characterEquipment  -> equipped weapons + exotic armour
//   1000 transitory         -> fireteam members (usually needs OAuth; best-effort)
//
// Activity / item names are resolved through the single-entity manifest endpoint
// (Destiny2/Manifest/{type}/{hash}/), which works with just the API key. Definitions
// are cached in memory so repeated polling costs nothing after the first lookup.

import { bungieGet } from './client'

const BASE = 'https://www.bungie.net/Platform'
const ICON_BASE = 'https://www.bungie.net'

const CLASS_BY_TYPE = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }

// Equipment bucket hashes.
const WEAPON_BUCKETS = new Set([1498876634 /*kinetic*/, 2465295065 /*energy*/, 953998645 /*power*/])
const ARMOR_BUCKETS = new Set([
  3448274439 /*helmet*/, 3551918588 /*gauntlets*/, 14239492 /*chest*/, 20886954 /*legs*/, 1585787867 /*class*/
])
const TIER_EXOTIC = 6

// Last real activity we reported, to ride out Bungie's profile-cache flapping when
// entering a new activity (see the stabilization note at the end of getLiveActivity).
let lastActivity: { hash: number; startedMs: number; result: any } | null = null

// --- Cached manifest entity lookups ---
const caches = {}
async function getEntity(type, hash) {
  if (!hash) return null
  const cache = caches[type] || (caches[type] = new Map())
  if (cache.has(hash)) return cache.get(hash)
  const { body } = await bungieGet(`${BASE}/Destiny2/Manifest/${type}/${hash}/`)
  const def = body?.Response || null
  cache.set(hash, def)
  return def
}

const iconUrl = (def) => (def?.displayProperties?.icon ? ICON_BASE + def.displayProperties.icon : null)

// Resolve a character's equipped weapons + exotic armour from its equipment items.
async function resolveLoadout(items = []) {
  const weapons = []
  const exoticArmor = []
  for (const it of items) {
    const isWeapon = WEAPON_BUCKETS.has(it.bucketHash)
    const isArmor = ARMOR_BUCKETS.has(it.bucketHash)
    if (!isWeapon && !isArmor) continue
    const def = await getEntity('DestinyInventoryItemDefinition', it.itemHash)
    if (!def) continue
    const exotic = def.inventory?.tierType === TIER_EXOTIC
    if (isWeapon) {
      weapons.push({ name: def.displayProperties?.name || 'Unknown', icon: iconUrl(def), exotic })
    } else if (isArmor && exotic) {
      exoticArmor.push({ name: def.displayProperties?.name || 'Unknown', icon: iconUrl(def) })
    }
  }
  return { weapons, exoticArmor }
}

// The currently-played character = the one whose current activity started most recently
// (dateActivityStarted updates the instant you load into an activity, so it tracks the
// live character far better than dateLastPlayed, which only updates on profile saves).
// We do NOT skip zero-hash characters — if the active character is in orbit (hash 0) we
// still pick it and report orbit, rather than falling back to another character's stale
// previous activity.
function pickActiveCharacter(activities) {
  let activeId = null
  let best = -1
  for (const [cid, ca] of Object.entries<any>(activities)) {
    const started = Date.parse(ca.dateActivityStarted || 0) || 0
    if (started >= best) {
      best = started
      activeId = cid
    }
  }
  return activeId
}

// Transitory party members only carry a membershipId (no name), so we first resolve the
// stable bits — the Bungie name + primary membership (type/id) — via LinkedProfiles
// (-1 wildcard). That lookup is cached permanently per membershipId.
const linkedCache = new Map()
async function resolveLinked(membershipId) {
  if (linkedCache.has(membershipId)) return linkedCache.get(membershipId)
  let res = { name: 'Guardian', type: null, id: membershipId }
  try {
    const { body } = await bungieGet(`${BASE}/Destiny2/-1/Profile/${membershipId}/LinkedProfiles/`)
    const prof = body?.Response?.profiles?.[0]
    if (prof) {
      let name = 'Guardian'
      if (prof.bungieGlobalDisplayName) {
        const code = String(prof.bungieGlobalDisplayNameCode ?? '').padStart(4, '0')
        name = `${prof.bungieGlobalDisplayName}#${code}`
      } else if (prof.displayName) {
        name = prof.displayName
      }
      res = { name, type: prof.membershipType, id: prof.membershipId }
    }
  } catch {
    /* leave defaults */
  }
  linkedCache.set(membershipId, res)
  return res
}

// Resolve a member's current emblem + loadout from their primary membership. Equipment
// (component 205) is privacy-gated, so loadout may come back empty — that's fine.
async function resolveMember(membershipId) {
  const linked = await resolveLinked(membershipId)
  let emblem = null
  let loadout = { weapons: [], exoticArmor: [] }
  if (linked.type) {
    try {
      const { body } = await bungieGet(
        `${BASE}/Destiny2/${linked.type}/Profile/${linked.id}/?components=200,205`
      )
      const chars = Object.entries<any>(body?.Response?.characters?.data || {})
      chars.sort((a, b) => Date.parse(b[1].dateLastPlayed || 0) - Date.parse(a[1].dateLastPlayed || 0))
      const [activeCharId, activeChar] = chars[0] || []
      if (activeChar?.emblemPath) emblem = ICON_BASE + activeChar.emblemPath
      const equip = body?.Response?.characterEquipment?.data || {}
      loadout = await resolveLoadout(equip[activeCharId]?.items || [])
    } catch {
      /* leave defaults */
    }
  }
  return { name: linked.name, emblem, loadout }
}

async function resolveFireteam(partyMembers = [], self) {
  const out = []
  for (const m of partyMembers) {
    if (self && m.membershipId === self.membershipId) {
      out.push({
        name: self.name,
        membershipId: m.membershipId,
        emblem: self.emblem,
        loadout: self.loadout,
        self: true
      })
    } else {
      const r = await resolveMember(m.membershipId)
      out.push({ name: r.name, membershipId: m.membershipId, emblem: r.emblem, loadout: r.loadout })
    }
  }
  return out
}

export async function getLiveActivity(session) {
  const membershipType = session.membershipType
  const membershipId = session.primaryMembershipId

  const { body } = await bungieGet(
    `${BASE}/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200,204,205,1000`
  )
  const resp = body?.Response
  if (!resp) return { ok: true, inActivity: false, reason: 'profile-unavailable' }

  const characters = resp.characters?.data || {}
  const activities = resp.characterActivities?.data || {}
  const equipment = resp.characterEquipment?.data || {}
  const dateLastPlayed = resp.profile?.data?.dateLastPlayed || null
  const transitory = resp.profileTransitoryData?.data || null

  const activeId = pickActiveCharacter(activities)
  const ca = activeId ? activities[activeId] : null
  const currentActivityHash = ca?.currentActivityHash || 0
  const currentModeHash = ca?.currentActivityModeHash || 0

  // Online heuristic: played recently. `dateLastPlayed` only updates on profile changes
  // (activity transitions, gear swaps), so it can lag by several minutes even while
  // genuinely in-activity — hence a generous 20-minute window. If offline, show idle.
  const onlineRecently =
    dateLastPlayed && Date.now() - Date.parse(dateLastPlayed) < 20 * 60 * 1000
  if (!onlineRecently) {
    return { ok: true, inActivity: false, lastPlayed: dateLastPlayed }
  }

  // Resolve activity name + type. A zero / nameless hash is orbit / menus / transitions —
  // we default those to "Orbit" rather than flapping in and out of the idle state.
  let activityName = ''
  let activityType = ''
  let background = null
  let startedAt = null
  let isRaidOrDungeon = false
  // modeHash 0 means the game reports no gameplay mode → orbit / menus (even if a stale
  // activity hash lingers). A real activity always carries a mode hash.
  if (currentActivityHash && currentModeHash !== 0) {
    const actDef = await getEntity('DestinyActivityDefinition', currentActivityHash)
    activityName = (
      actDef?.displayProperties?.name ||
      actDef?.originalDisplayProperties?.name ||
      ''
    ).trim()
    if (actDef?.activityTypeHash) {
      const typeDef = await getEntity('DestinyActivityTypeDefinition', actDef.activityTypeHash)
      activityType = typeDef?.displayProperties?.name || ''
    }
    background = actDef?.pgcrImage ? ICON_BASE + actDef.pgcrImage : null
    startedAt = ca.dateActivityStarted
    const t = activityType.toLowerCase()
    isRaidOrDungeon = t === 'raid' || t === 'dungeon'
  }

  const isOrbit = !activityName
  if (isOrbit) {
    activityName = 'Orbit'
    activityType = 'Orbit'
    background = null
    startedAt = null
  }

  // Active character loadout.
  const loadout = await resolveLoadout(equipment[activeId]?.items || [])

  // Fireteam (best-effort — transitory is often privacy-restricted without OAuth).
  const selfChar = characters[activeId]
  const selfEmblem = selfChar?.emblemPath ? ICON_BASE + selfChar.emblemPath : null
  let fireteam = []
  let fireteamSource = 'unavailable'
  if (transitory?.partyMembers?.length) {
    fireteam = await resolveFireteam(transitory.partyMembers, {
      membershipId,
      name: session.displayName,
      emblem: selfEmblem,
      loadout
    })
    fireteamSource = 'transitory'
  }

  const result = {
    ok: true,
    inActivity: true,
    isOrbit,
    isRaidOrDungeon,
    activityName,
    activityType,
    background,
    startedAt,
    character: { class: CLASS_BY_TYPE[characters[activeId]?.classType] || 'Guardian' },
    loadout,
    fireteam,
    fireteamSource,
    lastPlayed: dateLastPlayed
  }

  // Stabilize against Bungie's eventual-consistency flapping: for ~30–60s after loading
  // into a new activity, the Profile endpoint alternates between the new snapshot and the
  // previous one, so the overlay timer bounces between the new and old activities. A real
  // activity's start time only ever moves forward, so any snapshot that regresses to an
  // *earlier* start for a *different* activity is stale — keep showing the latest one.
  if (!isOrbit && startedAt) {
    const startedMs = Date.parse(startedAt)
    if (lastActivity && currentActivityHash !== lastActivity.hash && startedMs < lastActivity.startedMs) {
      return lastActivity.result
    }
    lastActivity = { hash: currentActivityHash, startedMs, result }
  }
  return result
}
