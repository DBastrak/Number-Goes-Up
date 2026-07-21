// Destiny manifest cache — the definition tables the inventory view needs to turn raw
// profile data (hashes + instance components) into readable item cards.
//
// The full DestinyInventoryItemDefinition table is tens of MB, so we don't keep it whole:
// on first run (and after each game patch) we download the tables, slim each entry down to
// just the fields the UI uses, and write those slim maps to userData. Steady-state memory
// is then a few MB, and startup just reads the slim files back.
//
// Version check: Destiny2/Manifest/ returns a `version` string that changes every patch.
// We store it alongside the slim files; a mismatch triggers a re-download.

import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { bungieGet } from './client'

const BASE = 'https://www.bungie.net/Platform'
const ROOT = 'https://www.bungie.net'

// Tables we slim + cache. Each has its own transform below.
const ITEM_TABLE = 'DestinyInventoryItemDefinition'
const STAT_TABLE = 'DestinyStatDefinition'
const DAMAGE_TABLE = 'DestinyDamageTypeDefinition'
const PLUGSET_TABLE = 'DestinyPlugSetDefinition' // random-roll perk pools per socket
const COLLECTIBLE_TABLE = 'DestinyCollectibleDefinition' // drop/source strings

// Socket category that holds a weapon's perk columns (barrel, magazine, traits, origin).
const WEAPON_PERKS_CATEGORY = 4241085061

// Bump when the slim ItemDef shape changes so existing caches re-derive instead of
// silently missing new fields (the cache is otherwise only refreshed on a game patch).
const SCHEMA = 5

type ItemDef = {
  name: string
  typeName: string // itemTypeDisplayName, e.g. "Hand Cannon" / "Hunter Helmet"
  icon: string | null
  watermark: string | null
  tier: number // inventory.tierType (6 = exotic, 5 = legendary…)
  type: number // itemType (3 = weapon, 2 = armor…)
  sub: number // itemSubType
  bucket: number // inventory.bucketTypeHash (the item's HOME bucket, not its live location)
  classType: number // 0 Titan / 1 Hunter / 2 Warlock / 3 any
  damage: number // defaultDamageType
  noTransfer: boolean
}

// A weapon catalog entry: the weapon plus its per-column random-roll perk pools.
export type WeaponPerk = { hash: number; name: string; icon: string | null }
export type WeaponCatalogEntry = {
  hash: string
  name: string
  icon: string | null
  watermark: string | null
  tier: number
  typeName: string
  source: string | null
  columns: { label: string; plugs: WeaponPerk[] }[]
  element?: string | null // damage type: Kinetic/Arc/Solar/Void/Stasis/Strand
  slot?: string | null // Kinetic / Energy / Power (ammo slot)
}

// DamageType enum -> element name; weapon bucket -> ammo slot. Both stable.
const DAMAGE_NAME = { 1: 'Kinetic', 2: 'Arc', 3: 'Solar', 4: 'Void', 6: 'Stasis', 7: 'Strand' }
const SLOT_BY_BUCKET = { 1498876634: 'Kinetic', 2465295065: 'Energy', 953998645: 'Power' }

let items: Record<string, ItemDef> = {}
let stats: Record<string, string> = {} // statHash -> name
let damage: Record<string, { name: string; icon: string | null }> = {}
let weapons: WeaponCatalogEntry[] = []
let loadedVersion: string | null = null

const iconUrl = (p) => (p ? ROOT + p : null)

// A single in-flight ensure() so concurrent inventory loads don't double-download.
let ensuring: Promise<{ ok: boolean; error?: string }> | null = null

function slimPath(name: string) {
  return join(app.getPath('userData'), `manifest-${name}.json`)
}
function versionPath() {
  return join(app.getPath('userData'), 'manifest-version.json')
}

// Disk cache is valid only when both the manifest version AND the slim schema match.
function diskCacheKey(): string | null {
  try {
    const { version, schema } = JSON.parse(readFileSync(versionPath(), 'utf8'))
    return version && schema === SCHEMA ? version : null
  } catch {
    return null
  }
}

function loadSlimFromDisk(): boolean {
  try {
    items = JSON.parse(readFileSync(slimPath('items'), 'utf8'))
    stats = JSON.parse(readFileSync(slimPath('stats'), 'utf8'))
    damage = JSON.parse(readFileSync(slimPath('damage'), 'utf8'))
    weapons = JSON.parse(readFileSync(slimPath('weapons'), 'utf8'))
    return true
  } catch {
    return false
  }
}

// Download a full component table JSON from its manifest path (large static files — no
// API key needed for these; only the manifest header call is authenticated by key).
async function downloadTable(path: string) {
  const res = await fetch(ROOT + path)
  if (!res.ok) throw new Error(`manifest table download failed (HTTP ${res.status})`)
  return res.json()
}

function slimItems(table: Record<string, any>) {
  const out: Record<string, ItemDef> = {}
  for (const hash in table) {
    const d = table[hash]
    const dp = d.displayProperties || {}
    // Skip redacted/nameless entries — they can't render a useful card or plug.
    if (!dp.name) continue
    out[hash] = {
      name: dp.name,
      typeName: d.itemTypeDisplayName || '',
      icon: dp.icon || null,
      watermark: d.iconWatermark || d.quality?.displayVersionWatermarkIcons?.[0] || null,
      tier: d.inventory?.tierType ?? 0,
      type: d.itemType ?? 0,
      sub: d.itemSubType ?? 0,
      bucket: d.inventory?.bucketTypeHash ?? 0,
      classType: d.classType ?? 3,
      damage: d.defaultDamageType ?? 0,
      noTransfer: !!d.nonTransferrable
    }
  }
  return out
}

function slimStats(table: Record<string, any>) {
  const out: Record<string, string> = {}
  for (const hash in table) {
    const name = table[hash]?.displayProperties?.name
    if (name) out[hash] = name
  }
  return out
}

function slimDamage(table: Record<string, any>) {
  const out: Record<string, { name: string; icon: string | null }> = {}
  for (const hash in table) {
    const dp = table[hash]?.displayProperties
    if (dp?.name) out[hash] = { name: dp.name, icon: dp.icon || null }
  }
  return out
}

// Build the weapon catalog: every legendary/exotic weapon with its perk columns (barrel,
// magazine, traits, origin) resolved from the Weapon Perks socket category's plug sets.
function buildWeaponCatalog(itemTable, plugSetTable, collectibleTable): WeaponCatalogEntry[] {
  const out: WeaponCatalogEntry[] = []
  for (const hash in itemTable) {
    const d = itemTable[hash]
    // Weapons only, legendary (5) + exotic (6), with a name.
    if (d.itemType !== 3 || (d.inventory?.tierType ?? 0) < 5 || !d.displayProperties?.name) continue
    const sockets = d.sockets
    if (!sockets?.socketEntries || !sockets.socketCategories) continue
    const cat = sockets.socketCategories.find((c) => c.socketCategoryHash === WEAPON_PERKS_CATEGORY)
    if (!cat?.socketIndexes) continue

    const columns: WeaponCatalogEntry['columns'] = []
    for (const idx of cat.socketIndexes) {
      const entry = sockets.socketEntries[idx]
      if (!entry) continue

      const plugs: WeaponPerk[] = []
      const seen = new Set<number>()
      const add = (ph) => {
        if (!ph || seen.has(ph)) return
        const pd = itemTable[ph]
        const pname = pd?.displayProperties?.name
        if (!pname) return
        seen.add(ph)
        plugs.push({ hash: ph, name: pname, icon: iconUrl(pd.displayProperties.icon) })
      }
      // Random pool preferred (world drops), else the fixed pool; then any inline reusable
      // plugs; then the single fixed plug — some sockets (e.g. a fixed Origin Trait) have
      // ONLY that, and would otherwise be missed.
      const setHash = entry.randomizedPlugSetHash || entry.reusablePlugSetHash
      const set = setHash ? plugSetTable[setHash] : null
      if (set?.reusablePlugItems) {
        for (const p of set.reusablePlugItems) {
          if (p.currentlyCanRoll === false) continue // only currently-obtainable perks
          add(p.plugItemHash)
        }
      }
      if (Array.isArray(entry.reusablePlugItems)) for (const p of entry.reusablePlugItems) add(p.plugItemHash)
      if (!plugs.length && entry.singleInitialItemHash) add(entry.singleInitialItemHash)
      if (plugs.length === 0) continue

      // Label from the socket's default plug type (reliable for "Origin Trait" / trackers),
      // falling back to the first resolved plug's type.
      const label =
        itemTable[entry.singleInitialItemHash]?.itemTypeDisplayName ||
        itemTable[plugs[0].hash]?.itemTypeDisplayName ||
        `Column ${columns.length + 1}`
      columns.push({ label, plugs })
    }

    // Keep any weapon with at least one resolvable perk column.
    if (columns.length === 0) continue

    out.push({
      hash,
      name: d.displayProperties.name,
      icon: iconUrl(d.displayProperties.icon),
      watermark: iconUrl(d.iconWatermark || d.quality?.displayVersionWatermarkIcons?.[0]),
      tier: d.inventory?.tierType ?? 0,
      typeName: d.itemTypeDisplayName || '',
      source: d.collectibleHash ? collectibleTable[d.collectibleHash]?.sourceString || null : null,
      columns
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

// Ensure the slim tables are loaded and current. Returns quickly when already in memory /
// unchanged on disk; otherwise downloads + slims + caches. Safe to call on every load.
export function ensureManifest(): Promise<{ ok: boolean; error?: string }> {
  if (ensuring) return ensuring
  ensuring = (async () => {
    try {
      const { body } = await bungieGet(`${BASE}/Destiny2/Manifest/`)
      const version = body?.Response?.version
      const paths = body?.Response?.jsonWorldComponentContentPaths?.en
      if (!version || !paths) {
        // Can't reach the manifest header — fall back to whatever slim files we have.
        if (loadedVersion || loadSlimFromDisk()) {
          loadedVersion = loadedVersion || diskCacheKey()
          return { ok: true }
        }
        return { ok: false, error: 'Could not reach the Destiny manifest.' }
      }

      if (loadedVersion === version && Object.keys(items).length) return { ok: true }

      // Disk already has this version + current schema — just load it into memory.
      if (diskCacheKey() === version && loadSlimFromDisk()) {
        loadedVersion = version
        return { ok: true }
      }

      // Download + slim the tables we need, then persist.
      const [itemTable, statTable, damageTable, plugSetTable, collectibleTable] = await Promise.all([
        downloadTable(paths[ITEM_TABLE]),
        downloadTable(paths[STAT_TABLE]),
        downloadTable(paths[DAMAGE_TABLE]),
        downloadTable(paths[PLUGSET_TABLE]),
        downloadTable(paths[COLLECTIBLE_TABLE])
      ])
      items = slimItems(itemTable)
      stats = slimStats(statTable)
      damage = slimDamage(damageTable)
      weapons = buildWeaponCatalog(itemTable, plugSetTable, collectibleTable)

      writeFileSync(slimPath('items'), JSON.stringify(items))
      writeFileSync(slimPath('stats'), JSON.stringify(stats))
      writeFileSync(slimPath('damage'), JSON.stringify(damage))
      writeFileSync(slimPath('weapons'), JSON.stringify(weapons))
      writeFileSync(versionPath(), JSON.stringify({ version, schema: SCHEMA }))
      loadedVersion = version
      console.log(
        '[manifest] cached', Object.keys(items).length, 'items,',
        weapons.length, 'random-roll weapons @', version
      )
      return { ok: true }
    } catch (err) {
      console.error('[manifest] ensure failed:', (err as Error).message)
      // Last resort: run on stale slim files if present.
      if (Object.keys(items).length || loadSlimFromDisk()) return { ok: true }
      return { ok: false, error: (err as Error).message }
    } finally {
      ensuring = null
    }
  })()
  return ensuring
}

export function isManifestReady() {
  return Object.keys(items).length > 0
}

export function itemDef(hash: number | string): ItemDef | null {
  return items[String(hash)] || null
}
export function statName(hash: number | string): string | null {
  return stats[String(hash)] || null
}
export function damageDef(hash: number | string) {
  return damage[String(hash)] || null
}
export function getWeaponCatalog(): WeaponCatalogEntry[] {
  // Attach element + slot from the slim item table (avoids rebuilding the cached catalog).
  return weapons.map((w) => {
    const d = items[w.hash]
    return {
      ...w,
      element: d ? DAMAGE_NAME[d.damage] || null : null,
      slot: d ? SLOT_BY_BUCKET[d.bucket] || null : null
    }
  })
}
