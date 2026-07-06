// Vendor weekly offerings, readable with just an API key (no OAuth):
// - Xûr: his live weekly stock from Destiny2.GetPublicVendors (the only public live
//   vendor). Bungie exposes his exotic armor page publicly; his weapon offers sit behind
//   sub-vendors that need OAuth, so weapons appear only when Bungie surfaces them.
// - Zavala: his weekly focused weapon drops, from his vendor definition's item list
//   (that list holds exactly the current focusing rotation).
// Perks come from the item definitions — exact for fixed-roll exotics.
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { bungieGet } from './client'

const ROOT = 'https://www.bungie.net/Platform'
const BNET = 'https://www.bungie.net'

const XUR_HASH = 2190858386
const ZAVALA_HASH = 69482069
// Zavala's "Weekly: Vanguard Arms Rewards" sub-vendor — the two dedicated weekly armor
// sets live here as real piece definitions (his own def only has opaque set containers).
const ZAVALA_ARMS_HASH = 153857624

// Manifest entity definitions are immutable per game version — cache the request promise
// per hash so concurrent lookups of the same def share one fetch (lives for the app session).
const defCache = new Map<string, Promise<any>>()
function getDef(table: string, hash: string | number) {
  const key = `${table}:${hash}`
  if (!defCache.has(key)) {
    defCache.set(
      key,
      bungieGet(`${ROOT}/Destiny2/Manifest/${table}/${hash}/`)
        .then(({ body }) => (body?.ErrorCode === 1 ? body.Response : null))
        .catch(() => null)
    )
  }
  return defCache.get(key)!
}

// Run `fn` over `arr` with limited concurrency (Bungie throttles bursts).
async function mapPool(arr: any[], size: number, fn: (x: any) => Promise<any>) {
  const out = new Array(arr.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, arr.length) }, async () => {
      while (next < arr.length) {
        const i = next++
        out[i] = await fn(arr[i])
      }
    })
  )
  return out
}

const INTRINSIC_CAT = 3956125808 // socket category: intrinsic traits
const WEAPON_PERKS_CAT = 4241085061 // socket category: weapon perks

const icon = (d) => (d?.displayProperties?.icon ? BNET + d.displayProperties.icon : null)

// Some pools list display dummies with itemType 0 but the weapon archetype as the type
// name — classify those as weapons too.
const WEAPON_TYPE_NAMES = new Set([
  'Auto Rifle',
  'Pulse Rifle',
  'Scout Rifle',
  'Hand Cannon',
  'Submachine Gun',
  'Sidearm',
  'Combat Bow',
  'Shotgun',
  'Sniper Rifle',
  'Fusion Rifle',
  'Linear Fusion Rifle',
  'Grenade Launcher',
  'Rocket Launcher',
  'Sword',
  'Trace Rifle',
  'Machine Gun',
  'Glaive'
])
const isWeapon = (e: { itemType: number; typeName: string }) =>
  e.itemType === 3 || WEAPON_TYPE_NAMES.has(e.typeName)

// Perks for the hover tooltip. Weapons: intrinsic + weapon-perk socket defaults.
// Armor: the intrinsic exotic perk.
async function extractPerks(def) {
  const sockets = def?.sockets
  if (!sockets?.socketEntries?.length) return []
  let entries = []
  if (def.itemType === 2) {
    entries = sockets.socketEntries
  } else {
    const indexes: number[] = []
    for (const c of sockets.socketCategories || []) {
      if (c.socketCategoryHash === INTRINSIC_CAT || c.socketCategoryHash === WEAPON_PERKS_CAT)
        indexes.push(...(c.socketIndexes || []))
    }
    entries = indexes.map((i) => sockets.socketEntries[i]).filter(Boolean)
  }
  const perks = []
  for (const e of entries) {
    if (!e?.singleInitialItemHash) continue
    const p = await getDef('DestinyInventoryItemDefinition', e.singleInitialItemHash)
    const name = p?.displayProperties?.name
    if (!name || name === 'Kill Tracker') continue
    // Armor: keep only the intrinsic exotic perk (skip mod slots, shaders, etc.).
    if (def.itemType === 2 && p?.plug?.plugCategoryIdentifier !== 'intrinsics') continue
    perks.push({
      name,
      icon: icon(p),
      type: p.itemTypeDisplayName || '',
      description: p.displayProperties?.description || ''
    })
  }
  return perks
}

// Full perk pool table for a random-roll weapon def: one column per perk socket (Barrel,
// Magazine, the two trait columns, origin trait) listing every currently-rollable option.
async function extractPerkColumns(def) {
  const sockets = def?.sockets
  if (!sockets?.socketEntries?.length) return null
  const indexes: number[] = []
  for (const c of sockets.socketCategories || []) {
    if (c.socketCategoryHash === WEAPON_PERKS_CAT) indexes.push(...(c.socketIndexes || []))
  }
  const cols = []
  let traitCount = 0
  for (const i of indexes) {
    const e = sockets.socketEntries[i]
    if (!e) continue
    const options: { name: string; type: string }[] = []
    if (e.randomizedPlugSetHash) {
      const ps = await getDef('DestinyPlugSetDefinition', e.randomizedPlugSetHash)
      for (const p of ps?.reusablePlugItems || []) {
        if (p.currentlyCanRoll === false) continue
        const pd = await getDef('DestinyInventoryItemDefinition', p.plugItemHash)
        const nm = pd?.displayProperties?.name
        if (nm && !options.some((o) => o.name === nm))
          options.push({ name: nm, type: pd.itemTypeDisplayName || '' })
      }
    } else if (e.singleInitialItemHash) {
      const pd = await getDef('DestinyInventoryItemDefinition', e.singleInitialItemHash)
      if (pd?.displayProperties?.name)
        options.push({ name: pd.displayProperties.name, type: pd.itemTypeDisplayName || '' })
    }
    if (!options.length || options[0].name === 'Kill Tracker') continue
    let label = options[0].type || 'Perk'
    if (label === 'Trait') label = `Perks ${++traitCount}`
    cols.push({ label, options: options.map((o) => o.name) })
  }
  // Only worth a table when at least one column actually has choices.
  return cols.some((c) => c.options.length > 1) ? cols : null
}

// Built item entries persist to disk keyed by manifest version, so lookups only happen
// once per game update (not per app launch).
type ItemEntry = {
  name: string
  icon: string | null
  itemType: number
  typeName: string
  tier: string
  description: string
  perks: any[]
  stats?: { name: string; value: number }[]
} | null
let itemCache: { version: string; items: Record<string, ItemEntry> } | null = null
let cacheDirty = false
const cachePath = () => join(app.getPath('userData'), 'vendor-item-cache-v2.json')

async function loadItemCache() {
  if (itemCache) return
  const manifest = await bungieGet(`${ROOT}/Destiny2/Manifest/`)
  const version = manifest.body?.Response?.version || 'unknown'
  try {
    const saved = JSON.parse(readFileSync(cachePath(), 'utf8'))
    itemCache = saved?.version === version ? saved : { version, items: {} }
  } catch {
    itemCache = { version, items: {} }
  }
}

function saveItemCache() {
  if (!itemCache || !cacheDirty) return
  try {
    writeFileSync(cachePath(), JSON.stringify(itemCache))
    cacheDirty = false
  } catch (err) {
    console.error('[vendors] failed to save item cache:', err)
  }
}

async function buildItem(itemHash): Promise<ItemEntry> {
  const cached = itemCache!.items[itemHash]
  if (cached !== undefined) return cached
  const d = await getDef('DestinyInventoryItemDefinition', itemHash)
  let entry: ItemEntry = null
  if (d?.displayProperties?.name) {
    entry = {
      name: d.displayProperties.name,
      icon: icon(d),
      itemType: d.itemType,
      typeName: d.itemTypeDisplayName || '',
      tier: d.inventory?.tierTypeName || '',
      description: d.displayProperties.description || '',
      perks: []
    }
    // Perks only matter for weapons and armor — skips plug lookups for the rest.
    if (isWeapon(entry) || d.itemType === 2) entry.perks = await extractPerks(d)
    // Armor stat table (Health / Melee / Grenade / Super / Class / Weapons) whenever the
    // definition carries non-zero values. Vendor armor usually rolls stats on drop, so
    // this stays empty until Bungie exposes instance stats — the UI shows it if present.
    if (d.itemType === 2) {
      const stats = []
      for (const [sh, v] of Object.entries(d.stats?.stats || {}) as any[]) {
        if (!v?.value) continue
        const sd = await getDef('DestinyStatDefinition', sh)
        const nm = sd?.displayProperties?.name
        if (nm) stats.push({ name: nm, value: v.value })
      }
      if (stats.length) entry.stats = stats
    }
  }
  itemCache!.items[itemHash] = entry
  cacheDirty = true
  return entry
}

const isCatalyst = (e: { name: string; typeName: string }) =>
  /catalyst/i.test(`${e.typeName} ${e.name}`)

// Turn a list of item hashes into display items: weapons (plus armor / catalysts if
// allowed), deduped by name (real weapon defs win over display dummies).
const GROUP_ORDER = { Weapons: 0, Armor: 1, 'Armor Sets': 2, Catalysts: 3 }
async function buildItems(hashes: number[], { armor = false, catalysts = false } = {}) {
  const hashArr = [...new Set(hashes)]
  const entries = await mapPool(hashArr, 12, buildItem)
  let items = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (!e) continue
    if (isWeapon(e)) items.push({ ...e, itemHash: hashArr[i], group: 'Weapons' })
    else if (armor && e.itemType === 2) items.push({ ...e, itemHash: hashArr[i], group: 'Armor' })
    else if (catalysts && isCatalyst(e))
      items.push({ ...e, itemHash: hashArr[i], group: 'Catalysts' })
  }
  items.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      (b.itemType === 3 ? 1 : 0) - (a.itemType === 3 ? 1 : 0) ||
      a.name.localeCompare(b.name)
  )
  const seen = new Set()
  return items.filter((it) => {
    const key = `${it.group}:${it.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Armor pieces don't reference their set, so build a reverse index (piece itemHash ->
// set def) from the DestinyEquipableItemSetDefinition table. Small table, fetched once
// per app session; on failure the tooltip just skips the set bonus.
let setIndex: Map<number, any> | null = null
async function loadSetIndex() {
  if (setIndex) return setIndex
  setIndex = new Map()
  try {
    const manifest = await bungieGet(`${ROOT}/Destiny2/Manifest/`)
    const path =
      manifest.body?.Response?.jsonWorldComponentContentPaths?.en
        ?.DestinyEquipableItemSetDefinition
    if (path) {
      const { body } = await bungieGet(`${BNET}${path}`)
      for (const s of Object.values(body || {}) as any[]) {
        for (const ih of s?.setItems || []) setIndex.set(ih, s)
      }
    }
  } catch (err) {
    console.error('[vendors] failed to load set index:', err)
  }
  return setIndex
}

async function vendorHeader(vendorHash) {
  const vdef = await getDef('DestinyVendorDefinition', vendorHash)
  if (!vdef?.displayProperties?.name) return null
  return {
    hash: String(vendorHash),
    name: vdef.displayProperties.name,
    subtitle: vdef.displayProperties.subtitle || ''
  }
}

// Weekly data — cache the assembled payload for an hour.
let cached: { at: number; payload: any } | null = null
const TTL_MS = 60 * 60 * 1000

export async function getPublicVendors() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.payload
  await loadItemCache()

  const vendors = []

  // Xûr — live weekly stock from the public vendors feed (absent Wed/Thu).
  const live = await bungieGet(`${ROOT}/Destiny2/Vendors/?components=402`)
  const xurSales = live.body?.Response?.sales?.data?.[XUR_HASH]?.saleItems
  if (xurSales) {
    const header = await vendorHeader(XUR_HASH)
    if (header) {
      const items = await buildItems(
        Object.values(xurSales).map((s: any) => s.itemHash),
        // Catalysts included whenever the public feed carries them (Xûr's 2 weekly
        // catalysts currently live behind OAuth-only sub-vendor sales — see note below).
        { armor: true, catalysts: true }
      )
      if (items.length) vendors.push({ ...header, items })
    }
  }

  // Zavala — his ONE focused weekly weapon (the entry listed with multiple copies in his
  // definition; the other weapons appearing once are the random leftovers) plus the two
  // dedicated weekly armor sets, expanded to real pieces with icons and separated by
  // class. Each piece's tooltip shows the set's 2pc/4pc bonus (armor stats aren't fixed —
  // they roll by archetype on drop, so the definitions carry zeros).
  const zheader = await vendorHeader(ZAVALA_HASH)
  if (zheader) {
    const zdef = await getDef('DestinyVendorDefinition', ZAVALA_HASH)
    const copies = new Map<number, number>()
    for (const it of zdef?.itemList || [])
      if (it.itemHash) copies.set(it.itemHash, (copies.get(it.itemHash) || 0) + 1)
    const weaponHashes = [...copies.keys()]
    const weaponEntries = await mapPool(weaponHashes, 12, buildItem)
    const weapons = []
    for (let i = 0; i < weaponEntries.length; i++) {
      const e = weaponEntries[i]
      if (e && isWeapon(e))
        weapons.push({
          ...e,
          itemHash: weaponHashes[i],
          group: 'Weapons',
          copies: copies.get(weaponHashes[i])
        })
    }
    // Focused weapon = highest copy count (falls back to all weapons if none repeats).
    const maxCopies = Math.max(0, ...weapons.map((w) => w.copies))
    let weaponItems = maxCopies > 1 ? weapons.filter((w) => w.copies === maxCopies) : weapons

    // Armor sets: real armor defs (itemType 2) inside the arms sub-vendor, grouped by
    // their equipable-set definition (which also names the set + carries the bonuses).
    const armsDef = await getDef('DestinyVendorDefinition', ZAVALA_ARMS_HASH)
    const armsHashes = [
      ...new Set((armsDef?.itemList || []).map((i) => i.itemHash).filter(Boolean))
    ] as number[]
    const armsDefs = await mapPool(armsHashes, 12, (h) =>
      getDef('DestinyInventoryItemDefinition', h)
    )

    // The 5 purchasable copies of the focused weapon roll randomly — the arms sub-vendor
    // carries the random-roll definition of the same weapon, whose plug sets list every
    // possible option per column (Barrel / Magazine / two perk columns). Attach that
    // table to the focused weapon's tooltip.
    for (const w of weaponItems) {
      const rollDef = armsDefs.find(
        (d) => d?.itemType === 3 && d.displayProperties?.name === w.name
      )
      const cols = await extractPerkColumns(rollDef)
      if (cols) {
        w.perkColumns = cols
        w.description = 'Randomly rolled — possible perks below.'
      }
    }
    // Zavala sells 5 copies of the focused weapon — show one tile per copy.
    if (maxCopies > 1) {
      weaponItems = weaponItems.flatMap((w) =>
        Array.from({ length: 5 }, (_, n) => ({ ...w, name: `${w.name} #${n + 1}` }))
      )
    }

    const CLASS_NAMES = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }
    const setIdx = await loadSetIndex()
    const setGroups = new Map<any, { sdef: any; pieces: any[] }>()
    for (let i = 0; i < armsDefs.length; i++) {
      const d = armsDefs[i]
      if (d?.itemType !== 2 || !d.displayProperties?.name) continue
      const sdef = setIdx.get(armsHashes[i]) || null
      // Fall back to the shared name prefix ("Luminopotent Grips" -> "Luminopotent")
      // when a piece isn't linked to a set definition.
      const key = sdef?.hash || d.displayProperties.name.split(' ').slice(0, -1).join(' ')
      if (!setGroups.has(key)) setGroups.set(key, { sdef, pieces: [] })
      setGroups.get(key)!.pieces.push({
        itemHash: armsHashes[i],
        name: d.displayProperties.name,
        icon: icon(d),
        itemType: d.itemType,
        typeName: d.itemTypeDisplayName || '',
        tier: d.inventory?.tierTypeName || '',
        className: CLASS_NAMES[d.classType] || '',
        classType: d.classType,
        description: ''
      })
    }
    const setItems = []
    for (const [key, g] of setGroups) {
      let groupName = typeof key === 'string' && key ? `${key} Set` : 'Armor Set'
      const perks = []
      if (g.sdef) {
        if (g.sdef.displayProperties?.name) groupName = `${g.sdef.displayProperties.name} Set`
        for (const p of g.sdef.setPerks || []) {
          const pd = await getDef('DestinySandboxPerkDefinition', p.sandboxPerkHash)
          if (pd?.displayProperties?.name)
            perks.push({
              name: pd.displayProperties.name,
              icon: icon(pd),
              type: `${p.requiredSetCount}pc`,
              description: pd.displayProperties.description || ''
            })
        }
      }
      // One section per class within each set (Titan, then Hunter, then Warlock).
      g.pieces.sort((a, b) => a.classType - b.classType)
      for (const piece of g.pieces)
        setItems.push({
          ...piece,
          group: piece.className ? `${groupName} — ${piece.className}` : groupName,
          perks
        })
    }

    const items = [...weaponItems, ...setItems]
    if (items.length) vendors.push({ ...zheader, items })
  }

  saveItemCache()

  const payload = { ok: true, vendors, fetchedAt: new Date().toISOString() }
  cached = { at: Date.now(), payload }
  return payload
}
