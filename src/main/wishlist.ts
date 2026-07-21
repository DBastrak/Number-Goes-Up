// Weapon wishlist — the god-rolls the user wants, persisted to userData/wishlist.json.
//
// An entry is keyed by the weapon's catalog hash and stores the perks the user picked as
// `groups`: one array per perk column that had a selection, each holding the acceptable
// plug hashes for that column. A weapon "matches" the wishlist when, for every group, it
// has at least one of that group's plugs (standard god-roll semantics). Matching against
// live inventory is done in the renderer via the weapon name (so any reissue counts).

import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync } from 'fs'

export type WishlistEntry = {
  weaponHash: string
  name: string
  icon: string | null
  groups: number[][] // per-column acceptable plug hashes
  savedAt: string
}

function wishlistPath() {
  return join(app.getPath('userData'), 'wishlist.json')
}

export function readWishlist(): WishlistEntry[] {
  try {
    const list = JSON.parse(readFileSync(wishlistPath(), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list: WishlistEntry[]) {
  try {
    writeFileSync(wishlistPath(), JSON.stringify(list, null, 2))
  } catch (err) {
    console.error('Failed to save wishlist:', err)
  }
}

// Upsert by weaponHash — saving the same weapon again replaces its selected perks.
export function saveWishlistEntry(entry: WishlistEntry) {
  if (!entry?.weaponHash) return { ok: false, error: 'Missing weapon.' }
  const list = readWishlist().filter((e) => e.weaponHash !== entry.weaponHash)
  list.push({ ...entry, savedAt: new Date().toISOString() })
  write(list)
  return { ok: true, list }
}

export function removeWishlistEntry(weaponHash: string) {
  write(readWishlist().filter((e) => e.weaponHash !== weaponHash))
  return { ok: true, list: readWishlist() }
}
