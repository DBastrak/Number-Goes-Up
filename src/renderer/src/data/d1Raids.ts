// The four Destiny 1 raids, in release order, with their PGCR banner art (from the D1
// manifest). Hash -> name/difficulty mapping lives in src/main/d1.ts.
const BG = 'https://www.bungie.net/img/theme/destiny/bgs/pgcrs/'

export const D1_RAIDS = [
  { name: 'Vault of Glass', bg: BG + 'raid_vault_of_glass.jpg' },
  { name: "Crota's End", bg: BG + 'raid_crotas_end.jpg' },
  { name: "King's Fall", bg: BG + 'kings_fall.jpg' },
  { name: 'Wrath of the Machine', bg: BG + 'wrath_of_the_machine.jpg' }
]

export function d1RaidBg(name) {
  return D1_RAIDS.find((r) => r.name === name)?.bg || null
}
