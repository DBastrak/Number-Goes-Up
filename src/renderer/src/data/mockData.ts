// Example Destiny 2 data used to populate the UI before we wire up the Bungie API.

export const profile = {
  bungieName: 'D3Believer#1111',
  guardianClass: 'Warlock',
  power: 2010,
  totalClears: 412,
  raidClears: 268,
  dungeonClears: 144,
  fastestRaid: '18:42',
  hoursPast2Weeks: 98.5,
  fireteamSize: 6
}

// Per-encounter breakdown for each activity, keyed by activity id.
// Shown in the accordion when a raid / dungeon is expanded.
const ENCOUNTERS = {
  se: [
    { name: 'Substratum', clears: 22, fastest: '6:12' },
    { name: 'Dissection', clears: 22, fastest: '5:40' },
    { name: 'Repository', clears: 21, fastest: '4:55' },
    { name: 'Verity', clears: 20, fastest: '7:48' },
    { name: 'Herald of Finality', clears: 22, fastest: '6:30' }
  ],
  ce: [
    { name: 'The Abyss', clears: 41, fastest: '3:10' },
    { name: 'The Bridge', clears: 40, fastest: '4:22' },
    { name: 'Ir Yût, the Deathsinger', clears: 39, fastest: '2:55' },
    { name: 'Crota, Son of Oryx', clears: 41, fastest: '3:48' }
  ],
  ron: [
    { name: 'Cataclysm', clears: 33, fastest: '5:01' },
    { name: 'Scission', clears: 31, fastest: '4:18' },
    { name: 'Macrocosm', clears: 30, fastest: '6:44' },
    { name: 'Nezarec, Final God of Pain', clears: 33, fastest: '5:55' }
  ],
  kf: [
    { name: 'Basilica', clears: 58, fastest: '3:40' },
    { name: 'Totems', clears: 57, fastest: '4:05' },
    { name: 'Warpriest', clears: 56, fastest: '3:22' },
    { name: 'Golgoroth', clears: 55, fastest: '4:50' },
    { name: 'Daughters of Oryx', clears: 54, fastest: '3:30' },
    { name: 'Oryx, the Taken King', clears: 58, fastest: '5:10' }
  ],
  votd: [
    { name: 'Acquisition', clears: 47, fastest: '5:20' },
    { name: 'Caretaker', clears: 46, fastest: '6:15' },
    { name: 'Exhibition', clears: 45, fastest: '4:30' },
    { name: 'Rhulk, Disciple of the Witness', clears: 47, fastest: '7:02' }
  ],
  dsc: [
    { name: 'Crypt Security', clears: 67, fastest: '4:40' },
    { name: 'Atraks-1', clears: 66, fastest: '5:15' },
    { name: 'Nuclear Descent', clears: 65, fastest: '2:10' },
    { name: 'Taniks, the Abomination', clears: 67, fastest: '6:18' }
  ],
  sd: [
    { name: 'Reliquary', clears: 11, fastest: '6:50' },
    { name: 'Zoetic Lockset', clears: 11, fastest: '7:30' },
    { name: 'Kerrev, the Erased', clears: 11, fastest: '8:05' }
  ],
  vh: [
    { name: 'Activation', clears: 19, fastest: '7:10' },
    { name: 'Raneiks Unified', clears: 18, fastest: '8:25' },
    { name: 'The Corrupted Puppeteer', clears: 19, fastest: '7:40' }
  ],
  wr: [
    { name: 'Rathil, First of His Name', clears: 24, fastest: '6:20' },
    { name: "Hefnd's Vengeance", clears: 23, fastest: '5:50' },
    { name: 'Locus of Wailing Grief', clears: 24, fastest: '7:15' }
  ],
  gotd: [
    { name: 'The Descent', clears: 31, fastest: '8:40' },
    { name: 'Ecthar, the Shield of Savathûn', clears: 30, fastest: '9:20' },
    { name: 'Simmumah ur-Nokru', clears: 31, fastest: '9:55' }
  ],
  sotw: [
    { name: 'The Ascent', clears: 22, fastest: '5:30' },
    { name: 'Akelous, the Siege-Engine', clears: 21, fastest: '6:10' },
    { name: 'Persys, Primordial Ruin', clears: 22, fastest: '5:45' }
  ],
  prophecy: [
    { name: 'Phalanx Echo', clears: 37, fastest: '4:20' },
    { name: 'Hexahedron', clears: 36, fastest: '5:05' },
    { name: 'Kell Echo', clears: 37, fastest: '6:35' }
  ]
}

// Master list of activities; sections below reference these by id.
const ACTIVITIES = {
  se: { id: 'se', title: "Salvation's Edge", type: 'Raid', clears: 22, fastest: '24:10', lastCompleted: '14 Jun', encounters: ENCOUNTERS.se },
  ce: { id: 'ce', title: "Crota's End", type: 'Raid', clears: 41, fastest: '18:42', lastCompleted: '11 Jun', encounters: ENCOUNTERS.ce },
  ron: { id: 'ron', title: 'Root of Nightmares', type: 'Raid', clears: 33, fastest: '19:05', lastCompleted: '2 Jun', encounters: ENCOUNTERS.ron },
  kf: { id: 'kf', title: "King's Fall", type: 'Raid', clears: 58, fastest: '26:11', lastCompleted: '28 May', encounters: ENCOUNTERS.kf },
  votd: { id: 'votd', title: 'Vow of the Disciple', type: 'Raid', clears: 47, fastest: '27:44', lastCompleted: '20 May', encounters: ENCOUNTERS.votd },
  dsc: { id: 'dsc', title: 'Deep Stone Crypt', type: 'Raid', clears: 67, fastest: '21:18', lastCompleted: '15 May', encounters: ENCOUNTERS.dsc },
  sd: { id: 'sd', title: 'Sundered Doctrine', type: 'Dungeon', clears: 11, fastest: '21:58', lastCompleted: '13 Jun', encounters: ENCOUNTERS.sd },
  vh: { id: 'vh', title: "Vesper's Host", type: 'Dungeon', clears: 19, fastest: '23:30', lastCompleted: '9 Jun', encounters: ENCOUNTERS.vh },
  wr: { id: 'wr', title: "Warlord's Ruin", type: 'Dungeon', clears: 24, fastest: '20:47', lastCompleted: '4 Jun', encounters: ENCOUNTERS.wr },
  gotd: { id: 'gotd', title: 'Ghosts of the Deep', type: 'Dungeon', clears: 31, fastest: '28:12', lastCompleted: '26 May', encounters: ENCOUNTERS.gotd },
  sotw: { id: 'sotw', title: 'Spire of the Watcher', type: 'Dungeon', clears: 22, fastest: '17:39', lastCompleted: '18 May', encounters: ENCOUNTERS.sotw },
  prophecy: { id: 'prophecy', title: 'Prophecy', type: 'Dungeon', clears: 37, fastest: '16:05', lastCompleted: '10 May', encounters: ENCOUNTERS.prophecy }
}

// Library sections — Destiny 2 raids & dungeons grouped into categories.
export const librarySections = [
  {
    id: 'all',
    label: 'All Activities',
    activities: [ACTIVITIES.se, ACTIVITIES.sd, ACTIVITIES.ce, ACTIVITIES.vh]
  },
  {
    id: 'raids',
    label: 'Raids',
    activities: [ACTIVITIES.se, ACTIVITIES.ce, ACTIVITIES.ron, ACTIVITIES.kf, ACTIVITIES.votd, ACTIVITIES.dsc]
  },
  {
    id: 'dungeons',
    label: 'Dungeons',
    activities: [ACTIVITIES.sd, ACTIVITIES.vh, ACTIVITIES.wr, ACTIVITIES.gotd, ACTIVITIES.sotw, ACTIVITIES.prophecy]
  }
]

// Recently completed raids / dungeons.
export const recentActivity = [
  {
    id: 1,
    activity: "Salvation's Edge",
    type: 'Raid',
    result: 'Completed',
    duration: '31:24',
    fireteam: ['D3Believer', 'Deadra', 'WaxCentaur', 'pookie bear', 'Envious', 'TEENY WEENY'],
    date: '14 Jun'
  },
  {
    id: 2,
    activity: 'Sundered Doctrine',
    type: 'Dungeon',
    result: 'Completed',
    duration: '24:51',
    fireteam: ['D3Believer', 'Deadra', 'WaxCentaur'],
    date: '13 Jun'
  },
  {
    id: 3,
    activity: "Crota's End",
    type: 'Raid',
    result: 'Flawless',
    duration: '18:42',
    fireteam: ['D3Believer', 'Deadra', 'WaxCentaur', 'pookie bear', 'Envious', 'TEENY WEENY'],
    date: '11 Jun'
  },
  {
    id: 4,
    activity: "Vesper's Host",
    type: 'Dungeon',
    result: 'Completed',
    duration: '29:03',
    fireteam: ['D3Believer', 'Envious'],
    date: '9 Jun'
  },
  {
    id: 5,
    activity: "Warlord's Ruin",
    type: 'Dungeon',
    result: 'Solo',
    duration: '41:17',
    fireteam: ['D3Believer'],
    date: '4 Jun'
  }
]

// Per-encounter / triumph style achievements tied to raids & dungeons.
export const achievements = [
  { id: 'a1', activity: "Salvation's Edge", name: 'The Edge of Salvation', desc: 'Complete the Salvation’s Edge raid.', unlocked: true, date: '14 Jun', rarity: 'Rare · 8.2%' },
  { id: 'a2', activity: "Crota's End", name: 'Eyes Up, Guardian', desc: 'Defeat Crota without anyone dying.', unlocked: true, date: '11 Jun', rarity: 'Very Rare · 2.1%' },
  { id: 'a3', activity: "Crota's End", name: 'Swordbearer', desc: 'Pick up the sword in every encounter.', unlocked: false, date: null, rarity: 'Uncommon · 21%' },
  { id: 'a4', activity: 'Sundered Doctrine', name: 'Doctrine Decrypted', desc: 'Complete the Sundered Doctrine dungeon.', unlocked: true, date: '13 Jun', rarity: 'Rare · 6.4%' },
  { id: 'a5', activity: "Vesper's Host", name: 'Corrupted Cosmonaut', desc: 'Complete every encounter in Vesper’s Host.', unlocked: true, date: '9 Jun', rarity: 'Uncommon · 19%' },
  { id: 'a6', activity: "Warlord's Ruin", name: 'Lone Warlord', desc: 'Solo flawless Warlord’s Ruin.', unlocked: false, date: null, rarity: 'Very Rare · 1.4%' }
]
