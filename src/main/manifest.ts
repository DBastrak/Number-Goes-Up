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

// Bump when the slim ItemDef shape changes so existing caches re-derive instead of
// silently missing new fields (the cache is otherwise only refreshed on a game patch).
const SCHEMA = 2

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

let items: Record<string, ItemDef> = {}
let stats: Record<string, string> = {} // statHash -> name
let damage: Record<string, { name: string; icon: string | null }> = {}
let loadedVersion: string | null = null

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
      const [itemTable, statTable, damageTable] = await Promise.all([
        downloadTable(paths[ITEM_TABLE]),
        downloadTable(paths[STAT_TABLE]),
        downloadTable(paths[DAMAGE_TABLE])
      ])
      items = slimItems(itemTable)
      stats = slimStats(statTable)
      damage = slimDamage(damageTable)

      writeFileSync(slimPath('items'), JSON.stringify(items))
      writeFileSync(slimPath('stats'), JSON.stringify(stats))
      writeFileSync(slimPath('damage'), JSON.stringify(damage))
      writeFileSync(versionPath(), JSON.stringify({ version, schema: SCHEMA }))
      loadedVersion = version
      console.log('[manifest] cached', Object.keys(items).length, 'items @', version)
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
