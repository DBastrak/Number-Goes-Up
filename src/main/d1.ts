// Destiny 1 support — account detection, raid history + PGCRs, and the inventory manager.
//
// D1 lives under /Platform/Destiny/ (not Destiny2). D1 only ever shipped on PlayStation (2)
// and Xbox (1), and a D1 account shares its membershipId with the D2 membership on the same
// platform — so we detect it by probing the account Summary for each PSN/Xbox membership.
//
// Endpoints (all send X-API-Key; inventory + transfers also send the OAuth Bearer token):
//   Destiny/{type}/Account/{id}/Summary/ ......................... characters (existence check)
//   Destiny/Stats/ActivityHistory/{type}/{id}/{cid}/?mode=Raid ... raid / strike history (paged)
//   Destiny/Stats/PostGameCarnageReport/{instanceId}/ ............ carnage report
//   Destiny/{type}/Account/{id}/Character/{cid}/Inventory/ ....... character items (auth = full)
//   Destiny/{type}/MyAccount/Vault/ .............................. vault (auth only)
//   Destiny/TransferItem/ (POST) ................................. vault <-> character
//   Destiny/Manifest/{Activity|ActivityType|InventoryItem}/{hash}/  single definition
//   Destiny/Vendors/{vendorHash}/ ................................ public vendor stock (no auth)

import { bungieGet, bungiePost } from './client'

const BASE = 'https://www.bungie.net/Platform'
const ICON = 'https://www.bungie.net'
const PAGE_COUNT = 100
const D1_PLATFORMS = new Set([1, 2]) // Xbox, PlayStation

const iconUrl = (path) => (path ? ICON + path : null)
const statValue = (values, key) => values?.[key]?.basic?.value

// A D1 Stats error, carrying Bungie's message (e.g. "temporarily disabled for maintenance").
function bungieError(body, what) {
  return new Error(`${what}: ${body?.Message || body?.ErrorStatus || `error ${body?.ErrorCode}`}`)
}

// --- Raid hashes (from the D1 world manifest's DestinyActivityDefinition) ---
// tier 1 = normal, tier 2+ = hard / heroic / Age of Triumph 390 — shown as "prestige".
const D1_RAIDS: Record<number, { name: string; difficulty: 'normal' | 'prestige' }> = {
  2659248071: { name: 'Vault of Glass', difficulty: 'normal' },
  2659248068: { name: 'Vault of Glass', difficulty: 'prestige' },
  2659248069: { name: 'Vault of Glass', difficulty: 'prestige' },
  4038697181: { name: 'Vault of Glass', difficulty: 'prestige' },
  856898338: { name: 'Vault of Glass', difficulty: 'prestige' },
  1836893116: { name: "Crota's End", difficulty: 'normal' },
  1836893119: { name: "Crota's End", difficulty: 'prestige' },
  2324706853: { name: "Crota's End", difficulty: 'prestige' },
  4000873610: { name: "Crota's End", difficulty: 'prestige' },
  1733556769: { name: "King's Fall", difficulty: 'normal' },
  3534581229: { name: "King's Fall", difficulty: 'normal' },
  1016659723: { name: "King's Fall", difficulty: 'prestige' },
  3978884648: { name: "King's Fall", difficulty: 'prestige' },
  260765522: { name: 'Wrath of the Machine', difficulty: 'normal' },
  1387993552: { name: 'Wrath of the Machine', difficulty: 'normal' },
  430160982: { name: 'Wrath of the Machine', difficulty: 'prestige' },
  3356249023: { name: 'Wrath of the Machine', difficulty: 'prestige' }
}

// Known hash first; otherwise fall back to the inline definition the history call returned.
function describeRaid(hash, defs?) {
  const known = D1_RAIDS[hash]
  if (known) return known
  const d = defs?.[hash]
  return {
    name: d?.activityName || `Raid ${hash}`,
    difficulty: (d?.tier ?? 1) >= 2 ? 'prestige' : 'normal'
  }
}

const HISTORY_MODES = ['Raid', 'AllStrikes']
// DestinyActivityModeType values the strike history returns (3 Strike, 16 Heroic, 17 Nightfall,
// 18 AllStrikes).
const STRIKE_MODES = new Set([3, 16, 17, 18])
const HEROIC_MODE = 16
const NIGHTFALL_MODE = 17
const NIGHTFALL_ACTIVITY_TYPE = 344644403 // ACTIVITY_TYPE_NIGHTFALL

// Heroic runs mostly come back as plain mode 3, so they are recognised by the definition:
// a tier 2+ variant, or the "Epic" modifier the heroic playlists carry.
function strikeDifficulty(details, def) {
  if (details.mode === NIGHTFALL_MODE || def?.activityTypeHash === NIGHTFALL_ACTIVITY_TYPE) {
    return 'nightfall'
  }
  const hasEpicModifier = (def?.skulls || []).some((skull) => skull.displayName === 'Epic')
  if (details.mode === HEROIC_MODE || (def?.tier ?? 1) >= 2 || hasEpicModifier) return 'heroic'
  return 'normal'
}

// Strikes have too many hash variants to list, so their name and banner art come from the
// inline definition instead of a hash table.
function describeActivity(details, defs?) {
  const hash = details?.referenceId
  if (!STRIKE_MODES.has(details?.mode)) return { mode: 'raid', bg: null, ...describeRaid(hash, defs) }
  const def = defs?.[hash]
  return {
    mode: 'strike',
    name: def?.activityName || `Strike ${hash}`,
    difficulty: strikeDifficulty(details, def),
    bg: iconUrl(def?.pgcrImage)
  }
}

// --- Account detection ---

// Every D1 account among a session's Destiny memberships (PSN/Xbox only). A Bungie account
// with both platforms linked can have one on each.
export async function findD1Accounts(memberships = []) {
  const accounts = []
  const candidates = memberships.filter((m) => D1_PLATFORMS.has(m.membershipType))
  for (const m of candidates) {
    const { body } = await bungieGet(
      `${BASE}/Destiny/${m.membershipType}/Account/${m.membershipId}/Summary/`,
      { retries: 2 }
    )
    const chars = body?.Response?.data?.characters
    if (body?.ErrorCode === 1 && Array.isArray(chars) && chars.length > 0) {
      accounts.push({
        membershipType: m.membershipType,
        membershipId: m.membershipId,
        // D1 predates Bungie names — the platform (PSN / Xbox) name is the account's real name.
        displayName: m.displayName || null,
        characters: chars.length
      })
    }
  }
  return accounts
}

// Does the session's primary membership have a D2 profile?
async function hasD2Profile(session) {
  if (!session?.primaryMembershipId) return false
  const { body } = await bungieGet(
    `${BASE}/Destiny2/${session.membershipType}/Profile/${session.primaryMembershipId}/?components=100`,
    { retries: 2 }
  )
  return body?.ErrorCode === 1
}

// Which games this account can use: { d1: the selected D1 account | null, d1Accounts, d2: bool }.
export async function detectGames(session) {
  const [d1Accounts, d2] = await Promise.all([
    findD1Accounts(session?.destinyMemberships || []).catch(() => []),
    hasD2Profile(session).catch(() => false)
  ])
  return { d1: d1Accounts[0] || null, d1Accounts, d2, checkedAt: new Date().toISOString() }
}

// --- Characters ---

const CLASS_BY_TYPE = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }

async function getD1Characters(d1) {
  const { body } = await bungieGet(
    `${BASE}/Destiny/${d1.membershipType}/Account/${d1.membershipId}/Summary/`
  )
  if (body?.ErrorCode !== 1) throw bungieError(body, 'Could not read your D1 account')
  return (body.Response?.data?.characters || []).map((c) => ({
    id: c.characterBase.characterId,
    classType: c.characterBase.classType,
    class: CLASS_BY_TYPE[c.characterBase.classType] || 'Guardian',
    emblem: iconUrl(c.emblemPath),
    light: c.characterBase.powerLevel ?? null
  }))
}

// --- Raid + strike history ---

async function getCharacterHistory(d1, characterId, historyMode) {
  const all = []
  const seen = new Set()
  for (let page = 0; ; page++) {
    const { body } = await bungieGet(
      `${BASE}/Destiny/Stats/ActivityHistory/${d1.membershipType}/${d1.membershipId}/${characterId}/` +
        `?mode=${historyMode}&count=${PAGE_COUNT}&page=${page}&definitions=true`
    )
    if (body?.ErrorCode !== 1) throw bungieError(body, 'D1 activity history failed')
    const activities = body.Response?.data?.activities || []
    const defs = body.Response?.definitions?.activities
    for (const a of activities) {
      const details = a.activityDetails || {}
      if (details.instanceId) {
        if (seen.has(details.instanceId)) continue
        seen.add(details.instanceId)
      }
      const info = describeActivity(details, defs)
      const values = a.values || {}
      all.push({
        mode: info.mode,
        game: 'd1',
        characterId,
        instanceId: details.instanceId,
        referenceId: details.referenceId,
        activityName: info.name,
        difficulty: info.difficulty,
        bg: info.bg,
        period: a.period,
        completed: statValue(values, 'completed') === 1,
        durationSeconds: statValue(values, 'activityDurationSeconds'),
        kills: statValue(values, 'kills'),
        deaths: statValue(values, 'deaths'),
        assists: statValue(values, 'assists'),
        playerCount: statValue(values, 'playerCount')
      })
    }
    // D1 may cap the page size below what we ask for, so only an empty page means "done".
    if (activities.length === 0) break
  }
  return all
}

// Every D1 raid + strike run across the account's characters, newest first, PGCR-enriched.
export async function loadD1Activities(d1, cache = {}) {
  const characters = await getD1Characters(d1)
  const byInstance = new Map()
  for (const c of characters) {
    for (const historyMode of HISTORY_MODES) {
      for (const a of await getCharacterHistory(d1, c.id, historyMode)) {
        a.className = c.class
        const key = a.instanceId || `${a.characterId}:${a.referenceId}:${a.period}`
        const existing = byInstance.get(key)
        if (!existing || (a.completed && !existing.completed)) byInstance.set(key, a)
      }
    }
  }
  const activities = [...byInstance.values()].sort(
    (a, b) => +new Date(b.period) - +new Date(a.period)
  )
  const enriched = await enrichD1Activities(activities, cache)
  console.log('[d1] loaded', activities.length, 'runs | PGCR', enriched.fetched, 'new,', enriched.failed, 'failed')
  return { characters, activities, loadedAt: new Date().toISOString() }
}

// --- PGCR ---

export async function getD1Pgcr(instanceId) {
  const { body } = await bungieGet(
    `${BASE}/Destiny/Stats/PostGameCarnageReport/${instanceId}/?definitions=true`
  )
  if (body?.ErrorCode !== 1) throw bungieError(body, 'D1 carnage report failed')
  const r = body.Response?.data
  if (!r) return null

  const players = (r.entries || []).map((e) => {
    const info = e.player?.destinyUserInfo || {}
    const values = e.values || {}
    return {
      name: info.displayName,
      membershipId: info.membershipId,
      characterId: e.characterId,
      emblem: iconUrl(info.iconPath),
      className: e.player?.characterClass || '',
      completed: statValue(values, 'completed') === 1,
      kills: statValue(values, 'kills'),
      deaths: statValue(values, 'deaths'),
      assists: statValue(values, 'assists'),
      kd: statValue(values, 'killsDeathsRatio'),
      score: statValue(values, 'score'),
      timePlayedSeconds: statValue(values, 'activityDurationSeconds')
    }
  })
  const teamDeaths = players.reduce((sum, p) => sum + (p.deaths || 0), 0)
  const accountCount =
    new Set(players.map((p) => p.membershipId).filter(Boolean)).size || players.length
  const info = describeActivity(r.activityDetails, body.Response?.definitions?.activities)

  return {
    instanceId,
    period: r.period,
    referenceId: r.activityDetails?.referenceId,
    mode: info.mode,
    activityName: info.name,
    difficulty: info.difficulty,
    bg: info.bg,
    durationSeconds: statValue(r.entries?.[0]?.values, 'activityDurationSeconds'),
    teamDeaths,
    flawless: teamDeaths === 0,
    accountCount,
    players
  }
}

// Fill teamDeaths / flawless / real fireteam size / player names from each completed run's
// PGCR, using (and updating) `cache` keyed by instanceId. D1 PGCRs have no "started from
// the beginning" flag, so `fresh` stays unknown (null).
async function enrichD1Activities(activities, cache) {
  const apply = (a, rec) => {
    a.teamDeaths = rec.teamDeaths
    a.flawless = rec.teamDeaths === 0
    a.fresh = null
    if (rec.players) a.players = rec.players
    if (rec.accountCount > 0) a.playerCount = rec.accountCount
  }
  const toFetch = []
  for (const a of activities) {
    if (!a.completed || !a.instanceId) continue
    if (cache[a.instanceId]) apply(a, cache[a.instanceId])
    else toFetch.push(a)
  }
  let fetched = 0
  let failed = 0
  let i = 0
  const worker = async () => {
    while (i < toFetch.length) {
      const a = toFetch[i++]
      try {
        const r = await getD1Pgcr(a.instanceId)
        if (!r) {
          failed += 1
          continue
        }
        const rec = {
          teamDeaths: r.teamDeaths,
          accountCount: r.accountCount,
          players: r.players.map((p) => p.name).filter(Boolean)
        }
        cache[a.instanceId] = rec
        apply(a, rec)
        fetched += 1
      } catch {
        failed += 1
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, toFetch.length) }, worker))
  return { fetched, failed }
}

// --- Inventory ---

// Weapon/armour buckets. D1 shares these hashes with D2 for the core slots, plus Ghost and
// Artifact (grouped with armour).
const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645])
const ARMOR_BUCKETS = new Set([3448274439, 3551918588, 14239492, 20886954, 1585787867, 4023194814, 434908299])
const BUCKET_ORDER = {
  1498876634: 0, // primary
  2465295065: 1, // special
  953998645: 2, // heavy
  3448274439: 3, // helmet
  3551918588: 4, // gauntlets
  14239492: 5, // chest
  20886954: 6, // legs
  1585787867: 7, // class
  434908299: 8, // artifact
  4023194814: 9 // ghost
}
const TIER_NAME = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon', 2: 'Common', 1: 'Basic' }

// Collect every item object from a D1 inventory payload. Character inventories nest items
// under buckets.{Equippable,Item,Invisible}[].items; the vault under buckets[].items.
function flattenItems(buckets) {
  const out = []
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') {
      if (Array.isArray(node.items)) out.push(...node.items)
      else Object.values(node).forEach(walk)
    }
  }
  walk(buckets)
  return out
}

// Merge the definition blocks returned by several `definitions=true` calls.
function mergeDefs(target, defs) {
  for (const key of ['items', 'stats', 'talentGrids', 'damageTypes']) {
    target[key] = { ...(target[key] || {}), ...(defs?.[key] || {}) }
  }
  return target
}

function buildD1Item(entry, location, defs) {
  const def = defs.items?.[entry.itemHash]
  if (!def) return null
  const bucket = def.bucketTypeHash
  const category = WEAPON_BUCKETS.has(bucket) ? 'weapon' : ARMOR_BUCKETS.has(bucket) ? 'armor' : null
  if (!category) return null

  const iid = entry.itemInstanceId && entry.itemInstanceId !== '0' ? entry.itemInstanceId : null
  const equipped = !!entry.isEquipped

  const stats = (entry.stats || [])
    .map((s) => ({ name: defs.stats?.[s.statHash]?.statName, value: s.value }))
    .filter((s) => s.name && typeof s.value === 'number')
    .sort((a, b) => b.value - a.value)

  // Activated, visible talent-grid nodes -> perk chips.
  const grid = defs.talentGrids?.[entry.talentGridHash]
  const perks = []
  for (const n of entry.nodes || []) {
    if (!n.isActivated || n.hidden) continue
    const step = grid?.nodes?.[n.nodeHash]?.steps?.[n.stepIndex]
    if (!step?.nodeStepName) continue
    perks.push({ name: step.nodeStepName, icon: iconUrl(step.icon), enabled: true })
  }

  const dmg = defs.damageTypes?.[entry.damageTypeHash]
  const hasDamage = category === 'weapon' && entry.damageType > 0
  return {
    instanceId: iid,
    hash: entry.itemHash,
    name: def.itemName,
    typeName: def.itemTypeName || (category === 'weapon' ? 'Weapon' : 'Armour'),
    icon: iconUrl(def.icon),
    watermark: null,
    tier: def.tierType,
    tierName: TIER_NAME[def.tierType] || '',
    category,
    bucket,
    bucketOrder: BUCKET_ORDER[bucket] ?? 99,
    classType: def.classType,
    power: entry.primaryStat?.value ?? null,
    damage: hasDamage ? dmg?.damageTypeName || null : null,
    damageIcon: hasDamage ? iconUrl(dmg?.iconPath) : null,
    equipped,
    transferable: !!iid && !def.nonTransferrable && !equipped,
    location,
    stats,
    perks,
    search: [def.itemName, def.itemTypeName, ...perks.map((p) => p.name)].join(' ').toLowerCase()
  }
}

export async function getD1Inventory(d1, accessToken) {
  if (!accessToken) {
    return { ok: false, error: 'Sign in with your Bungie account to use the inventory manager.' }
  }
  const characters = await getD1Characters(d1)
  const defs: any = {}
  const columns: Record<string, any[]> = { vault: [] }

  const vault = await bungieGet(
    `${BASE}/Destiny/${d1.membershipType}/MyAccount/Vault/?definitions=true`,
    { token: accessToken }
  )
  if (vault.body?.ErrorCode !== 1) {
    return { ok: false, error: bungieError(vault.body, 'Could not read your D1 vault').message }
  }
  mergeDefs(defs, vault.body.Response?.definitions)
  const vaultItems = flattenItems(vault.body.Response?.data?.buckets)

  const charItems: Record<string, any[]> = {}
  for (const c of characters) {
    const { body } = await bungieGet(
      `${BASE}/Destiny/${d1.membershipType}/Account/${d1.membershipId}/Character/${c.id}/Inventory/?definitions=true`,
      { token: accessToken }
    )
    if (body?.ErrorCode !== 1) {
      return { ok: false, error: bungieError(body, `Could not read your ${c.class}`).message }
    }
    mergeDefs(defs, body.Response?.definitions)
    charItems[c.id] = flattenItems(body.Response?.data?.buckets)
  }

  for (const entry of vaultItems) {
    const item = buildD1Item(entry, 'vault', defs)
    if (item) columns.vault.push(item)
  }
  for (const c of characters) {
    columns[c.id] = []
    for (const entry of charItems[c.id]) {
      const item = buildD1Item(entry, c.id, defs)
      if (item) columns[c.id].push(item)
    }
  }
  for (const key in columns) {
    columns[key].sort(
      (a, b) =>
        (a.category === b.category ? 0 : a.category === 'weapon' ? -1 : 1) ||
        a.bucketOrder - b.bucketOrder ||
        (b.power || 0) - (a.power || 0)
    )
  }
  characters.sort((a, b) => a.classType - b.classType)
  return { ok: true, characters, columns, postmaster: {} }
}

async function transferOnce(token, d1, { itemHash, itemId, characterId, toVault }) {
  const { body } = await bungiePost(
    `${BASE}/Destiny/TransferItem/`,
    {
      membershipType: d1.membershipType,
      itemReferenceHash: itemHash,
      itemId,
      stackSize: 1,
      characterId,
      transferToVault: toVault
    },
    { token }
  )
  if (body?.ErrorCode !== 1) {
    throw new Error(body?.Message || body?.ErrorStatus || `error ${body?.ErrorCode}`)
  }
}

// Same routing as D2: vault <-> character directly, character -> character via the vault.
export async function transferD1Item(d1, accessToken, { itemHash, itemId, from, to }) {
  if (!accessToken) return { ok: false, error: 'Sign in with your Bungie account first.' }
  if (!itemId) return { ok: false, error: "This item can't be transferred." }
  if (from === to) return { ok: true }
  try {
    if (from === 'vault') {
      await transferOnce(accessToken, d1, { itemHash, itemId, characterId: to, toVault: false })
    } else if (to === 'vault') {
      await transferOnce(accessToken, d1, { itemHash, itemId, characterId: from, toVault: true })
    } else {
      await transferOnce(accessToken, d1, { itemHash, itemId, characterId: from, toVault: true })
      await transferOnce(accessToken, d1, { itemHash, itemId, characterId: to, toVault: false })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// --- Live activity ---

// Single-definition lookups, cached for the session so 1s polling costs nothing after the first.
const definitionCache = new Map()
async function getD1Definition(type, hash) {
  const key = `${type}:${hash}`
  if (definitionCache.has(key)) return definitionCache.get(key)
  const { body } = await bungieGet(`${BASE}/Destiny/Manifest/${type}/${hash}/`)
  // Response.data is { requestedId, <type>: definition }.
  const definition =
    Object.values(body?.Response?.data || {}).find((v) => v && typeof v === 'object') || null
  definitionCache.set(key, definition)
  return definition
}

const ONLINE_WINDOW_MS = 20 * 60 * 1000
// D1 reports no activity start time, so the timer runs from when we first saw the activity.
let firstSeenActivity: { hash: number; startedAt: string } | null = null

// Same result shape as the D2 getLiveActivity. D1 exposes no fireteam data.
export async function getD1LiveActivity(d1) {
  const { body } = await bungieGet(
    `${BASE}/Destiny/${d1.membershipType}/Account/${d1.membershipId}/Summary/`
  )
  const characters = body?.Response?.data?.characters || []
  if (body?.ErrorCode !== 1 || characters.length === 0) return { ok: true, inActivity: false }

  const lastPlayedMs = (c) => Date.parse(c.characterBase?.dateLastPlayed || 0) || 0
  const active = characters.reduce((a, b) => (lastPlayedMs(b) > lastPlayedMs(a) ? b : a))
  const base = active.characterBase
  const activityHash = base.currentActivityHash || 0
  if (!activityHash && Date.now() - lastPlayedMs(active) > ONLINE_WINDOW_MS) {
    firstSeenActivity = null
    return { ok: true, inActivity: false, lastPlayed: base.dateLastPlayed }
  }

  const activityDef = activityHash ? await getD1Definition('Activity', activityHash) : null
  const activityName = (activityDef?.activityName || '').trim()
  const isOrbit = !activityName
  const typeDef =
    !isOrbit && activityDef.activityTypeHash
      ? await getD1Definition('ActivityType', activityDef.activityTypeHash)
      : null
  const activityType = isOrbit ? 'Orbit' : typeDef?.activityTypeName || ''

  if (isOrbit) firstSeenActivity = null
  else if (firstSeenActivity?.hash !== activityHash) {
    firstSeenActivity = { hash: activityHash, startedAt: new Date().toISOString() }
  }

  const equippedDefs = await Promise.all(
    (base.peerView?.equipment || []).map((e) => getD1Definition('InventoryItem', e.itemHash))
  )
  const weapons = []
  const exoticArmor = []
  for (const def of equippedDefs) {
    if (!def) continue
    const exotic = def.tierType === 6
    const item = { name: def.itemName || 'Unknown', icon: iconUrl(def.icon), exotic }
    if (WEAPON_BUCKETS.has(def.bucketTypeHash)) weapons.push(item)
    else if (exotic && ARMOR_BUCKETS.has(def.bucketTypeHash)) exoticArmor.push(item)
  }

  return {
    ok: true,
    inActivity: true,
    isOrbit,
    isRaidOrDungeon: activityType.toLowerCase() === 'raid',
    activityName: isOrbit ? 'Orbit' : activityName,
    activityType,
    background: isOrbit ? null : iconUrl(activityDef.pgcrImage),
    startedAt: firstSeenActivity?.startedAt || null,
    timerApprox: true,
    character: { class: CLASS_BY_TYPE[base.classType] || 'Guardian' },
    loadout: { weapons, exoticArmor },
    fireteam: [],
    fireteamSource: 'unsupported',
    lastPlayed: base.dateLastPlayed
  }
}

// --- Vendors ---

// Read through the public vendor endpoint, so stock is the default (not per-character) offer.
// Vendors that are away (Xûr midweek, Iron Banner) answer DestinyVendorNotFound and are skipped,
// as are vendors with nothing public on sale.
const D1_VENDORS = [
  2796397637, // Xûr
  2610555297, // Iron Banner
  2668878854, // Vanguard Quartermaster
  1990950, // Titan Vanguard
  3003633346, // Hunter Vanguard
  1575820975, // Warlock Vanguard
  3746647075, // Crucible Handler
  3658200622, // Crucible Quartermaster
  3611686524, // Dead Orbit
  1821699360, // Future War Cult
  1808244981, // New Monarchy
  570929315, // Gunsmith
  174528503, // Eris Morn
  1998812735, // House of Judgment
  1410745145, // Queen's Wrath
  2680694281, // The Speaker
  4269570979, // Cryptarch
  134701236, // Guardian Outfitter
  459708109, // Shipwright
  3917130357 // Eververse
]

// Talent nodes every item has; they say nothing about this week's roll.
const GENERIC_NODE =
  /^(Infuse|Ascend|Twist Fate|Reforge Ready|Upgrade Damage|Increase (Intellect|Discipline|Strength)|\w+ Damage)$/

function buildD1VendorItem(sale, defs) {
  const entry = sale.item
  const def = defs.items?.[entry?.itemHash]
  if (!def?.itemName) return null

  // Every visible perk option, grouped by talent-grid column (the roll on sale).
  const grid = defs.talentGrids?.[entry.talentGridHash]
  const perksByColumn: Record<number, any[]> = {}
  for (const n of entry.nodes || []) {
    if (n.hidden) continue
    const node = grid?.nodes?.[n.nodeHash]
    const step = node?.steps?.[n.stepIndex]
    if (!step?.nodeStepName || GENERIC_NODE.test(step.nodeStepName)) continue
    ;(perksByColumn[node.column] ||= []).push({ name: step.nodeStepName, icon: iconUrl(step.icon) })
  }
  const columns = Object.keys(perksByColumn)
    .sort((a, b) => +a - +b)
    .map((column, i) => ({ label: `Column ${i + 1}`, perks: perksByColumn[column] }))

  const stats = (entry.stats || [])
    .map((s) => ({ name: defs.stats?.[s.statHash]?.statName, value: s.value }))
    .filter((s) => s.name && s.value > 0)
  const primaryStatName = defs.stats?.[entry.primaryStat?.statHash]?.statName
  const cost = (sale.costs || [])
    .filter((c) => c.value > 0)
    .map((c) => `${c.value} ${defs.items?.[c.itemHash]?.itemName || ''}`.trim())
    .join(' + ')

  return {
    hash: entry.itemHash,
    name: def.itemName,
    icon: iconUrl(def.icon),
    tier: def.tierType,
    detail: [
      def.itemTypeName,
      primaryStatName && `${primaryStatName} ${entry.primaryStat.value}`,
      cost
    ]
      .filter(Boolean)
      .join(' · '),
    columns: columns.length ? columns : null,
    stats
  }
}

async function getD1Vendor(vendorHash) {
  const { body } = await bungieGet(`${BASE}/Destiny/Vendors/${vendorHash}/?definitions=true`)
  const data = body?.Response?.data
  if (body?.ErrorCode !== 1 || !data) return null
  const defs = body.Response.definitions || {}
  const categories = (data.saleItemCategories || [])
    .map((category) => ({
      title: category.categoryTitle,
      items: (category.saleItems || []).map((sale) => buildD1VendorItem(sale, defs)).filter(Boolean)
    }))
    .filter((category) => category.items.length > 0)
  if (categories.length === 0) return null
  return {
    hash: vendorHash,
    name: defs.vendorDetails?.[vendorHash]?.summary?.vendorName || `Vendor ${vendorHash}`,
    nextRefresh: data.nextRefreshDate,
    categories
  }
}

export async function getD1Vendors() {
  const vendors = await Promise.all(D1_VENDORS.map(getD1Vendor))
  return { ok: true, vendors: vendors.filter(Boolean) }
}
