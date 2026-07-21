// Shared god-roll matching. A wishlist entry's `groups` is one array of acceptable plug
// hashes per selected perk column; a weapon matches when, for every group, it carries at
// least one of that group's plugs. Matching is by weapon name so any reissue counts.

export function weaponMatchesEntry(perkHashes: number[] | undefined, groups: number[][]) {
  if (!perkHashes || !groups?.length) return false
  const have = new Set(perkHashes)
  return groups.every((group) => group.some((h) => have.has(h)))
}

// Does an inventory weapon (by name + its rolled perk hashes) satisfy any wishlist entry?
export function isWishlisted(item, wishlist) {
  if (item?.category !== 'weapon' || !item.perkHashes || !wishlist?.length) return false
  return wishlist.some(
    (e) => e.name === item.name && weaponMatchesEntry(item.perkHashes, e.groups)
  )
}
