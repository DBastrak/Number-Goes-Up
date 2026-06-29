// Raid & dungeon metadata — the canonical list of every raid/dungeon, with release
// date and day-one window. Hash → name/difficulty linking lives in
// src/main/activityNames.js (generated from the manifest); this file adds the
// per-activity metadata used to determine DAY-ONE and CHALLENGE clears.
//
// Clear flags (computed in utils/matchActivities.js):
//   1 = day-one  — clear within releaseDate + dayOneHours, OR a "contest" difficulty
//   2 = challenge — a master / prestige / grandmaster / challenge difficulty
//
// dayOneHours = null means the activity never had a day-one race (older dungeons).
// `names` lists the activityName values (from activityNames.js) that map to this def.
// Dates marked "verify" are best-effort for the newest content.
// targetSeconds = your speed-run benchmark. Clear < target = devil icon 👿 (speed demon).
//                 Clear < target + 5min = running man icon 🏃. Adjust these to your standards!

// Background art base (Bungie CDN) — `bg` fields below are paths appended to this.
const BG = 'https://www.bungie.net'

export const ACTIVITY_DEFS = [
    // ---------------- RAIDS ----------------
    { name: 'Leviathan', type: 'raid', releaseDate: '2017-09-13', dayOneHours: 24, targetSeconds: 30 * 60, bg: BG + '/img/destiny_content/pgcr/raid_gluttony.jpg' },
    { name: 'Leviathan, Eater of Worlds', type: 'raid', releaseDate: '2017-12-05', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raids_leviathan_eater_of_worlds.jpg' },
    { name: 'Leviathan, Spire of Stars', type: 'raid', releaseDate: '2018-05-11', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raid_greed.jpg' },
    { name: 'Last Wish', type: 'raid', releaseDate: '2018-09-14', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raid_beanstalk.jpg' },
    { name: 'Scourge of the Past', type: 'raid', releaseDate: '2018-12-07', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raids.1305rh0093145r13t5hn10tnz.raid_sunset.jpg' },
    { name: 'Crown of Sorrow', type: 'raid', releaseDate: '2019-06-04', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raid_eclipse.jpg' },
    { name: 'Garden of Salvation', type: 'raid', releaseDate: '2019-10-05', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raid_garden_of_salvation.jpg' },
    { name: 'Deep Stone Crypt', type: 'raid', releaseDate: '2020-11-21', dayOneHours: 24, targetSeconds: 25 * 60, bg: BG + '/img/destiny_content/pgcr/europa-raid-deep-stone-crypt.jpg' },
    { name: 'Vault of Glass', type: 'raid', releaseDate: '2021-05-22', dayOneHours: 24, targetSeconds: 25 * 60, bg: BG + '/img/destiny_content/pgcr/vault_of_glass.jpg' },
    { name: 'Vow of the Disciple', type: 'raid', releaseDate: '2022-03-05', dayOneHours: 24, targetSeconds: 30 * 60, bg: BG + '/img/destiny_content/pgcr/raid_nemesis.jpg' },
    { name: "King's Fall", type: 'raid', releaseDate: '2022-08-26', dayOneHours: 24, targetSeconds: 30 * 60, bg: BG + '/img/destiny_content/pgcr/raid_kings_fall.jpg' },
    { name: 'Root of Nightmares', type: 'raid', releaseDate: '2023-03-10', dayOneHours: 24, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/raid_root_of_nightmares.jpg' },
    { name: "Crota's End", type: 'raid', releaseDate: '2023-09-01', dayOneHours: 24, targetSeconds: 30 * 60, bg: BG + '/img/destiny_content/pgcr/raid_crotas_end.jpg' },
    { name: "Salvation's Edge", type: 'raid', releaseDate: '2024-06-07', dayOneHours: 24, targetSeconds: 45 * 60, bg: BG + '/img/destiny_content/pgcr/raid_splinter.jpg' },
    { name: 'The Desert Perpetual', type: 'raid', releaseDate: '2025-07-19', dayOneHours: 24, targetSeconds: 45 * 60, bg: BG + '/img/destiny_content/pgcr/raid_gateways.jpg' }, // verify
    {
        name: 'Pantheon',
        type: 'raid',
        releaseDate: '2024-04-30',
        dayOneHours: null, // event activity, no day-one race
        targetSeconds: 45 * 60,
        bg: BG + '/img/destiny_content/pgcr/pantheon_calus.jpg',
        names: [
            'Pantheon: Calus Resplendent',
            'Pantheon: Morgeth Surpassing',
            'Pantheon: Morgeth',
            'Pantheon: Insurrection Prime Revolutionary',
            'The Pantheon: Atraks Sovereign',
            'The Pantheon: Rhulk Indomitable',
            'The Pantheon: Oryx Exalted',
            'The Pantheon: Nezarec Sublime'
        ]
    },

    // ---------------- DUNGEONS ----------------
    { name: 'The Shattered Throne', type: 'dungeon', releaseDate: '2018-09-13', dayOneHours: null, targetSeconds: 10 * 60, bg: BG + '/img/destiny_content/pgcr/mission_labyrinth.jpg' },
    { name: 'Pit of Heresy', type: 'dungeon', releaseDate: '2019-10-29', dayOneHours: null, targetSeconds: 12 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_pit_of_heresy.jpg' },
    { name: 'Prophecy', type: 'dungeon', releaseDate: '2020-06-09', dayOneHours: null, targetSeconds: 12 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_prophecy.jpg' },
    { name: 'Grasp of Avarice', type: 'dungeon', releaseDate: '2021-12-07', dayOneHours: null, targetSeconds: 15 * 60, bg: BG + '/img/destiny_content/pgcr/30th-anniversary-grasp-of-avarice.jpg' },
    { name: 'Duality', type: 'dungeon', releaseDate: '2022-05-27', dayOneHours: null, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_duality.jpg' },
    { name: 'Spire of the Watcher', type: 'dungeon', releaseDate: '2022-12-09', dayOneHours: null, targetSeconds: 15 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_spire_of_the_watcher.jpg' },
    { name: 'Ghosts of the Deep', type: 'dungeon', releaseDate: '2023-05-26', dayOneHours: null, targetSeconds: 25 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_ghosts_of_the_deep.jpg' },
    { name: "Warlord's Ruin", type: 'dungeon', releaseDate: '2023-11-28', dayOneHours: 48, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_ridgeline.jpg' }, // first contest dungeon
    { name: "Vesper's Host", type: 'dungeon', releaseDate: '2024-10-11', dayOneHours: 48, targetSeconds: 25 * 60, bg: BG + '/img/destiny_content/pgcr/vespers_host.jpg' },
    { name: 'Sundered Doctrine', type: 'dungeon', releaseDate: '2025-02-07', dayOneHours: 48, targetSeconds: 30 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_delver.jpg' },
    { name: 'Equilibrium', type: 'dungeon', releaseDate: '2025-09-16', dayOneHours: 48, targetSeconds: 20 * 60, bg: BG + '/img/destiny_content/pgcr/dungeon_equilibrium.jpg' } // verify
]

// activityName (from activityNames.js) -> canonical def. Includes alias names.
const NAME_INDEX = (() => {
    const index = new Map()
    for (const def of ACTIVITY_DEFS) {
        index.set(def.name, def)
        for (const alias of def.names || []) index.set(alias, def)
    }
    return index
})()

export function resolveDef(activityName) {
    return NAME_INDEX.get(activityName) || null
}

// Difficulties that count as a "challenge" clear (flag 2).
export const CHALLENGE_DIFFICULTIES = new Set([
    'master',
    'prestige',
    'grandmaster',
    'challenge',
    'legend',
    'expert'
])