// Inventory manager — read every character's + the vault's weapons and armour (with live
// stats and perks), and move items between the vault and characters.
//
// Reading uses one authenticated GetProfile with the inventory/equipment components plus
// the instanced item components (power, stats, sockets). Those private components only
// come back when the request carries the account's own OAuth token — so this whole feature
// requires being signed in with Bungie.
//
// Moving uses Destiny2/Actions/Items/TransferItem/. Bungie has no direct character-to-
// character transfer, so a character→character move is done as two hops through the vault.

import { bungieGet, bungiePost } from './client'
import { ensureManifest, itemDef, statName, damageDef } from './manifest'

const BASE = 'https://www.bungie.net/Platform'
const ICON = 'https://www.bungie.net'

const CLASS_BY_TYPE = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock', 3: 'Guardian' }

// Home buckets we surface. Vault items report the vault bucket as their live location, so
// categorisation always uses the item definition's home bucket (see manifest ItemDef.bucket).
const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645])
const ARMOR_BUCKETS = new Set([3448274439, 3551918588, 14239492, 20886954, 1585787867])
const BUCKET_ORDER = {
  1498876634: 0, // kinetic
  2465295065: 1, // energy
  953998645: 2, // power
  3448274439: 3, // helmet
  3551918588: 4, // gauntlets
  14239492: 5, // chest
  20886954: 6, // legs
  1585787867: 7 // class
}

const TIER_NAME = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon', 2: 'Common', 1: 'Basic' }

// transferStatus is a bitmask; bit 1 (value 1) = item is equipped.
const EQUIPPED_FLAG = 1

// Postmaster (Lost Items) bucket — items sitting in it report this as their live bucketHash.
const POSTMASTER_BUCKET = 215593132

const iconUrl = (path) => (path ? ICON + path : null)

// Build one UI item from a raw inventory entry + the instanced component maps.
function buildItem(entry, location, instances, statsData, socketsData) {
  const def = itemDef(entry.itemHash)
  if (!def) return null
  const category = WEAPON_BUCKETS.has(def.bucket)
    ? 'weapon'
    : ARMOR_BUCKETS.has(def.bucket)
      ? 'armor'
      : null
  if (!category) return null // only weapons + armour in this view

  const iid = entry.itemInstanceId
  const inst = iid ? instances?.[iid] : null
  const equipped = (entry.transferStatus & EQUIPPED_FLAG) === EQUIPPED_FLAG

  // Live stats -> [{ name, value }], skipping the ones with no manifest name.
  const rawStats = iid ? statsData?.[iid]?.stats : null
  const statList = []
  if (rawStats) {
    for (const sh in rawStats) {
      const name = statName(sh)
      const value = rawStats[sh]?.value
      if (name && typeof value === 'number') statList.push({ name, value })
    }
    statList.sort((a, b) => b.value - a.value)
  }

  // Currently-inserted plugs (perks / mods / masterwork / armour set + intrinsic perks)
  // from the sockets component. `perks` is the visible set shown in the tooltip; every
  // plug name (visible or not) also feeds search so armour set-bonus / intrinsic perk
  // names are matchable even when they aren't rendered as a chip.
  const rawSockets = iid ? socketsData?.[iid]?.sockets : null
  const perks = []
  const plugNames = []
  const perkHashes: number[] = [] // every inserted plug hash — used for wishlist matching
  if (Array.isArray(rawSockets)) {
    for (const s of rawSockets) {
      if (!s.plugHash) continue
      perkHashes.push(s.plugHash)
      const pd = itemDef(s.plugHash)
      if (!pd?.name) continue
      plugNames.push(pd.name)
      if (s.isVisible !== false) {
        perks.push({ name: pd.name, icon: iconUrl(pd.icon), enabled: s.isEnabled !== false })
      }
    }
  }

  const dmg = damageDef(inst?.damageType ?? def.damage)
  // Search matches item name, its type (e.g. "Hand Cannon" / "Hunter Helmet"), and every
  // plug/perk name — so a search like "powerhouse" hits an armour set perk of that name.
  const searchable = [def.name, def.typeName, ...plugNames].join(' ').toLowerCase()

  return {
    instanceId: iid || null,
    hash: entry.itemHash,
    name: def.name,
    typeName: def.typeName || (category === 'weapon' ? 'Weapon' : 'Armour'),
    icon: iconUrl(def.icon),
    watermark: iconUrl(def.watermark),
    tier: def.tier,
    tierName: TIER_NAME[def.tier] || '',
    category,
    bucket: def.bucket,
    bucketOrder: BUCKET_ORDER[def.bucket] ?? 99,
    classType: def.classType,
    power: inst?.primaryStat?.value ?? null,
    damage: dmg?.name || null,
    damageIcon: iconUrl(dmg?.icon),
    equipped,
    // Movable only if it's a distinct instance, its def allows transfer, and it isn't the
    // currently-equipped piece (equipped gear can't be transferred without an equip swap).
    transferable: !!iid && !def.noTransfer && !equipped,
    location,
    stats: statList,
    perks,
    perkHashes: category === 'weapon' ? perkHashes : undefined,
    search: searchable
  }
}

// Lighter builder for postmaster items — includes every item type (engrams, materials,
// gear), not just weapons/armour, since the postmaster holds anything.
function buildPostmasterItem(entry, instances) {
  const def = itemDef(entry.itemHash)
  if (!def) return null
  const iid = entry.itemInstanceId || null
  const inst = iid ? instances?.[iid] : null
  const isGear = WEAPON_BUCKETS.has(def.bucket) || ARMOR_BUCKETS.has(def.bucket)
  return {
    instanceId: iid,
    hash: entry.itemHash,
    name: def.name,
    icon: iconUrl(def.icon),
    watermark: iconUrl(def.watermark),
    tier: def.tier,
    tierName: TIER_NAME[def.tier] || '',
    bucket: def.bucket, // home slot the item lands in when pulled (for room-making)
    power: inst?.primaryStat?.value ?? null,
    quantity: entry.quantity > 1 ? entry.quantity : null,
    // Can continue on to the vault only if it's transferable instanced gear.
    vaultable: isGear && !!iid && !def.noTransfer
  }
}

export async function getInventory(session, accessToken) {
  if (!accessToken) {
    return { ok: false, error: 'Sign in with your Bungie account to use the inventory manager.' }
  }
  const man = await ensureManifest()
  if (!man.ok) return { ok: false, error: man.error || 'Item database unavailable.' }

  const membershipType = session.membershipType
  const membershipId = session.primaryMembershipId

  // 200 characters, 102 vault, 201 char inventories, 205 equipment, 300 instances,
  // 304 stats, 305 sockets.
  const { body } = await bungieGet(
    `${BASE}/Destiny2/${membershipType}/Profile/${membershipId}/` +
      `?components=200,102,201,205,300,304,305`,
    { token: accessToken }
  )
  const resp = body?.Response
  if (!resp) return { ok: false, error: 'Could not read your profile.' }

  const instances = resp.itemComponents?.instances?.data || {}
  const statsData = resp.itemComponents?.stats?.data || {}
  const socketsData = resp.itemComponents?.sockets?.data || {}

  // Characters, ordered Titan → Hunter → Warlock (matches the app's other views).
  const charData = resp.characters?.data || {}
  const characters = Object.entries<any>(charData)
    .map(([id, c]) => ({
      id,
      classType: c.classType,
      class: CLASS_BY_TYPE[c.classType] || 'Guardian',
      emblem: iconUrl(c.emblemPath),
      light: c.light
    }))
    .sort((a, b) => a.classType - b.classType)

  const columns = { vault: [] as any[] }
  const postmaster = {} as Record<string, any[]>
  for (const c of characters) {
    columns[c.id] = []
    postmaster[c.id] = []
  }

  const push = (entry, location) => {
    const item = buildItem(entry, location, instances, statsData, socketsData)
    if (item) columns[location].push(item)
  }

  // Vault (profile inventory).
  for (const entry of resp.profileInventory?.data?.items || []) push(entry, 'vault')

  // Each character's inventory + equipped items. Postmaster (Lost Items) entries are split
  // out into their own list rather than showing in the character's normal slots.
  const charInv = resp.characterInventories?.data || {}
  const charEquip = resp.characterEquipment?.data || {}
  for (const c of characters) {
    for (const entry of charInv[c.id]?.items || []) {
      if (entry.bucketHash === POSTMASTER_BUCKET) {
        const pm = buildPostmasterItem(entry, instances)
        if (pm) postmaster[c.id].push(pm)
      } else {
        push(entry, c.id)
      }
    }
    for (const entry of charEquip[c.id]?.items || []) push(entry, c.id)
  }

  // Sort each column: weapons before armour, then bucket order, then power desc.
  for (const key in columns) {
    columns[key].sort(
      (a, b) =>
        (a.category === b.category ? 0 : a.category === 'weapon' ? -1 : 1) ||
        a.bucketOrder - b.bucketOrder ||
        (b.power || 0) - (a.power || 0)
    )
  }

  return { ok: true, characters, columns, postmaster }
}

// One TransferItem call. transferToVault=true pulls a character's item into the vault;
// false pushes a vault item onto the given character.
async function transferOnce(token, { membershipType, itemHash, itemId, characterId, toVault }) {
  const { body } = await bungiePost(
    `${BASE}/Destiny2/Actions/Items/TransferItem/`,
    {
      itemReferenceHash: itemHash,
      stackSize: 1,
      transferToVault: toVault,
      itemId,
      characterId,
      membershipType
    },
    { token }
  )
  const ec = body?.ErrorCode
  if (ec !== 1) {
    const msg = body?.Message || body?.ErrorStatus || `error ${ec}`
    throw new Error(msg)
  }
}

// Move an item between the vault and characters. `from` / `to` are 'vault' or a characterId.
// character→character routes through the vault (two hops), matching how Bungie requires it.
export async function transferItem(session, accessToken, { itemHash, itemId, from, to }) {
  if (!accessToken) return { ok: false, error: 'Sign in with your Bungie account first.' }
  if (!itemId) return { ok: false, error: "This item can't be transferred." }
  if (from === to) return { ok: true }

  const membershipType = session.membershipType
  try {
    if (from === 'vault') {
      await transferOnce(accessToken, { membershipType, itemHash, itemId, characterId: to, toVault: false })
    } else if (to === 'vault') {
      await transferOnce(accessToken, { membershipType, itemHash, itemId, characterId: from, toVault: true })
    } else {
      // character → vault → character
      await transferOnce(accessToken, { membershipType, itemHash, itemId, characterId: from, toVault: true })
      await transferOnce(accessToken, { membershipType, itemHash, itemId, characterId: to, toVault: false })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// Pull an item out of a character's postmaster (Lost Items) into their inventory, and — for
// transferable gear when `toVault` is set — continue on to the vault.
export async function pullFromPostmaster(
  session,
  accessToken,
  { itemHash, itemId, characterId, toVault }
) {
  if (!accessToken) return { ok: false, error: 'Sign in with your Bungie account first.' }
  const membershipType = session.membershipType
  try {
    const { body } = await bungiePost(
      `${BASE}/Destiny2/Actions/Items/PullFromPostmaster/`,
      { itemReferenceHash: itemHash, stackSize: 1, itemId: itemId || 0, characterId, membershipType },
      { token: accessToken }
    )
    const ec = body?.ErrorCode
    if (ec !== 1) throw new Error(body?.Message || body?.ErrorStatus || `error ${ec}`)
    if (toVault && itemId) {
      await transferOnce(accessToken, { membershipType, itemHash, itemId, characterId, toVault: true })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
