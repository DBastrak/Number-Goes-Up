// Vendors — live weekly offerings from Zavala (Vanguard) and Xûr.
//
// Modern vendors wrap their real gear in sub-vendors, and the sale items are often "preview"
// definitions with itemType 0 and a generic bucket. So we categorise by weapon subtype /
// class rather than itemType, resolve armour stats from the vendor stat component, and read
// each weapon's actual roll from the vendor socket component (its own hash isn't in the
// weapon catalog).

import { bungieGet } from './client'
import { ensureManifest, itemDef, statName } from './manifest'

const BASE = 'https://www.bungie.net/Platform'
const ICON = 'https://www.bungie.net'

// Sub-vendors that hold the actual sale items.
const ZAVALA_WEEKLY = 153857624 // "Weekly: Vanguard Arms Rewards" — curated weekly armour + weapons
const XUR = 2190858386 // exotic armour + exotic class item
const XUR_STRANGE = 3751514131 // legendaries + exotic weapon + catalysts

const iconUrl = (p) => (p ? ICON + p : null)
const CLASS_BY_TYPE = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock', 3: 'Any' }
const TIER_NAME = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon' }

// DestinyItemSubType values that are weapons.
const WEAPON_SUBTYPES = new Set([6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 22, 23, 24, 25, 31, 33])
// Plug itemTypeDisplayName values that count as weapon perks (a roll's columns).
const PERK_TYPES = new Set([
  'Barrel', 'Launcher Barrel', 'Magazine', 'Battery', 'Sight', 'Scope', 'Stock', 'Grip',
  'Guard', 'Blade', 'Bowstring', 'Arrow', 'Haft', 'Bolt', 'Rail', 'Tang', 'Handle', 'Trait'
])

function kindOf(def) {
  if (def.type === 3 || WEAPON_SUBTYPES.has(def.sub)) return 'weapon'
  if (def.type === 2 || def.classType === 0 || def.classType === 1 || def.classType === 2)
    return 'armour'
  if (/catalyst/i.test(def.name || '')) return 'catalyst'
  return null
}

// One vendor query with the components we need.
async function getVendor(mType, mId, characterId, vendorHash, token) {
  const url =
    `${BASE}/Destiny2/${mType}/Profile/${mId}/Character/${characterId}/Vendors/${vendorHash}/` +
    `?components=401,402,304,305,310`
  const { body } = await bungieGet(url, { token })
  return body?.Response || null
}

function baseFields(sale, def) {
  return {
    hash: sale.itemHash,
    name: def.name,
    icon: iconUrl(def.icon),
    watermark: iconUrl(def.watermark),
    tier: def.tier,
    tierName: TIER_NAME[def.tier] || ''
  }
}

function buildArmour(sale, def, statComp) {
  const raw = statComp?.stats
  const stats = []
  if (raw) {
    for (const sh in raw) {
      const n = statName(sh)
      const v = raw[sh]?.value
      if (n && typeof v === 'number' && v > 0) stats.push({ name: n, value: v })
    }
    stats.sort((a, b) => b.value - a.value)
  }
  return {
    ...baseFields(sale, def),
    classType: def.classType,
    className: CLASS_BY_TYPE[def.classType] || 'Any',
    stats
  }
}

const plugOpt = (h) => {
  const pd = itemDef(h)
  return pd ? { name: pd.name, icon: iconUrl(pd.icon) } : null
}

// Build the weapon's perk COLUMNS from the vendor's reusable plugs — each perk socket's
// full set of options (e.g. 3 traits in each of columns 3 & 4) — plus origin options and
// the masterwork tier. Falls back to the single inserted plugs for fixed-roll exotics.
function buildWeapon(sale, def, socketComp, reuseComp) {
  const columns = [] as { label: string; perks: any[] }[]
  let origin = null
  let masterwork = null

  const reuse = reuseComp?.plugs || {}
  for (const k of Object.keys(reuse).sort((a, b) => Number(a) - Number(b))) {
    const plugs = reuse[k]
    if (!plugs?.length) continue
    const first = itemDef(plugs[0].plugItemHash)
    if (!first?.name) continue
    if (/masterwork/i.test(first.name) || /^tier \d/i.test(first.name)) {
      masterwork = first.name
      continue
    }
    const t = (first.typeName || '').replace(/^Enhanced\s+/i, '')
    const opts = plugs.map((p) => plugOpt(p.plugItemHash)).filter(Boolean)
    if (/^origin trait$/i.test(t)) origin = { perks: opts }
    else if (PERK_TYPES.has(t)) columns.push({ label: t, perks: opts })
  }

  // Fixed-roll fallback (exotics): read the single inserted plug per socket.
  if (!columns.length) {
    for (const s of socketComp?.sockets || []) {
      if (!s.plugHash) continue
      const pd = itemDef(s.plugHash)
      if (!pd?.name) continue
      const t = (pd.typeName || '').replace(/^Enhanced\s+/i, '')
      if (/masterwork/i.test(pd.name) || /^tier \d/i.test(pd.name)) masterwork = masterwork || pd.name
      else if (/^origin trait$/i.test(t)) origin = origin || { perks: [plugOpt(s.plugHash)] }
      else if (PERK_TYPES.has(t)) columns.push({ label: t, perks: [plugOpt(s.plugHash)] })
    }
  }

  return { ...baseFields(sale, def), typeName: def.typeName || '', columns, origin, masterwork }
}

function collectSales(resp, out) {
  const sales = resp?.sales?.data || {}
  const statData = resp?.itemComponents?.stats?.data || {}
  const socketData = resp?.itemComponents?.sockets?.data || {}
  const reuseData = resp?.itemComponents?.reusablePlugs?.data || {}
  for (const idx in sales) {
    const sale = sales[idx]
    const def = itemDef(sale.itemHash)
    if (!def) continue
    const kind = kindOf(def)
    if (kind === 'armour') {
      const a = buildArmour(sale, def, statData[idx])
      ;(def.tier === 6 ? out.exotics : out.armour).set(a.hash, a)
    } else if (kind === 'weapon') {
      const w = buildWeapon(sale, def, socketData[idx], reuseData[idx])
      if (def.tier === 6) out.exotics.set(w.hash, w)
      // A weapon may be sold as several versions with different perk pools — key by the
      // pool so distinct ones all show, while duplicate class-queries dedupe.
      else {
        const sig = w.hash + '|' + w.columns.map((c) => c.perks.map((p) => p.name).join(',')).join('|')
        out.weapons.set(sig, w)
      }
    } else if (kind === 'catalyst') {
      out.exotics.set(sale.itemHash, { ...baseFields(sale, def), isCatalyst: true })
    }
  }
}

export async function getVendors(session, accessToken) {
  if (!accessToken) return { ok: false, error: 'Sign in with your Bungie account to see vendors.' }
  const man = await ensureManifest()
  if (!man.ok) return { ok: false, error: man.error || 'Item database unavailable.' }

  const mType = session.membershipType
  const mId = session.primaryMembershipId
  const { body } = await bungieGet(`${BASE}/Destiny2/${mType}/Profile/${mId}/?components=200`, {
    token: accessToken
  })
  const chars = Object.entries<any>(body?.Response?.characters?.data || {}).map(([id, c]) => ({
    id,
    classType: c.classType
  }))
  if (!chars.length) return { ok: false, error: 'No characters found on this account.' }
  const byClass = [...new Map(chars.map((c) => [c.classType, c])).values()]

  const buckets = () => ({ armour: new Map(), weapons: new Map(), exotics: new Map() })

  // Zavala weekly offering — armour is class-specific, so query one character per class
  // (weapons dedupe by roll across the queries).
  const z = buckets()
  for (const ch of byClass) {
    const r = await getVendor(mType, mId, ch.id, ZAVALA_WEEKLY, accessToken)
    if (r) collectSales(r, z)
  }

  // Xûr: exotic armour from main (per class, to catch all class exotics); strange gear per
  // class too (its legendary armour is class-specific).
  const x = buckets()
  let xMain = null
  let xStrange = null
  for (const ch of byClass) {
    const m = await getVendor(mType, mId, ch.id, XUR, accessToken)
    const s = await getVendor(mType, mId, ch.id, XUR_STRANGE, accessToken)
    if (!xMain) xMain = m
    if (!xStrange) xStrange = s
    if (m) collectSales(m, x)
    if (s) collectSales(s, x)
  }
  const xurHere = !!(xMain?.sales?.data && Object.keys(xMain.sales.data).length > 0)

  const pack = (b) => ({
    armour: [...b.armour.values()],
    weapons: [...b.weapons.values()],
    exotics: [...b.exotics.values()]
  })
  return { ok: true, zavala: pack(z), xur: { ...pack(x), here: xurHere } }
}
