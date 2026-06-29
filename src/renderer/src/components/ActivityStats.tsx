import { resolveDef } from '../data/activityDefs'
import '../styles/following.css'

// Shared raid/dungeon stats section (totals bar + per-activity card grid) used by both the
// Following profile and the Activities (Library) tab. `columns` sets the grid width.

// Column = a stat field shown in the totals bar and per-activity cards. `popup` adds a hover
// breakdown: 'diff' splits clears/full by difficulty (from `src`), 'size' splits low-mans by
// fireteam size. The 3rd column is "Low-man" for raids (≤3) with a solo/duo/trio popup, and
// "Solo" for dungeons (1, no popup needed).
export const RAID_COLS = [
  { key: 'clears', label: 'Clears', popup: 'diff', src: 'clearsByDiff' },
  { key: 'full', label: 'Full', popup: 'diff', src: 'fullByDiff' },
  { key: 'lowman', label: 'Low-man', popup: 'size', src: 'lowmanBySize' },
  { key: 'flawless', label: 'Flawless' }
]
export const DUNGEON_COLS = [
  { key: 'clears', label: 'Clears', popup: 'diff', src: 'clearsByDiff' },
  { key: 'full', label: 'Full', popup: 'diff', src: 'fullByDiff' },
  { key: 'lowman', label: 'Solo' },
  { key: 'flawless', label: 'Flawless' }
]

// Pantheon encounters aren't in activityDefs, so borrow the banner art of the raid the
// boss comes from (image only — the card keeps the Pantheon name + stats).
const PANTHEON_BANNER_RAID = {
  'Pantheon: Morgeth': 'Last Wish',
  'Pantheon: Morgeth Surpassing': 'Last Wish',
  'Pantheon: Insurrection Prime': 'Scourge of the Past',
  'Pantheon: Insurrection Prime Revolutionary': 'Scourge of the Past',
  'Pantheon: Warpriest': "King's Fall",
  'Pantheon: Argos': 'Leviathan, Eater of Worlds',
  'Pantheon: Calus': 'Leviathan',
  'Pantheon: Calus Resplendent': 'Leviathan',
  'Pantheon: Gahlran': 'Crown of Sorrow',
  'Pantheon: Consecrated Mind': 'Garden of Salvation',
  'The Pantheon: Oryx Exalted': "King's Fall",
  'The Pantheon: Rhulk Indomitable': 'Vow of the Disciple',
  'The Pantheon: Atraks Sovereign': 'Deep Stone Crypt',
  'The Pantheon: Nezarec Sublime': 'Root of Nightmares'
}

const DIFF_ORDER = ['normal', 'master', 'prestige', 'contest', 'grandmaster', 'legend', 'expert', 'epic']
const DIFF_LABELS = {
  normal: 'Normal',
  master: 'Master',
  prestige: 'Prestige',
  contest: 'Contest',
  grandmaster: 'Grandmaster',
  legend: 'Legend',
  expert: 'Expert',
  epic: 'Epic'
}
const SIZE_ROWS: [string, string][] = [
  ['1', 'Solo'],
  ['2', 'Duo'],
  ['3', 'Trio']
]

// Build the hover-popup rows for a column from a data object (a row or a totals object).
function buildBreakdown(col, data) {
  if (!col.popup || !data) return null
  const obj = data[col.src] || {}
  let rows: { label: string; value: number }[] = []
  if (col.popup === 'diff') {
    rows = DIFF_ORDER.filter((d) => obj[d]).map((d) => ({ label: DIFF_LABELS[d], value: obj[d] }))
  } else if (col.popup === 'size') {
    rows = SIZE_ROWS.filter(([n]) => obj[n]).map(([n, lbl]) => ({ label: lbl, value: obj[n] }))
  }
  return rows.length ? rows : null
}

function StatPopup({ rows }: any) {
  return (
    <div className="cell-popup">
      {rows.map((b) => (
        <div key={b.label} className="cell-popup-row">
          <span className="cell-popup-key">{b.label}</span>
          <span className="cell-popup-val">{b.value}</span>
        </div>
      ))}
    </div>
  )
}

export function ActivitySection({ title, cls, totals, rows = [], cols, columns = 4 }: any) {
  return (
    <section className="profile-section">
      <h3 className={`activity-tag ${cls}`} style={{ fontSize: '20px' }}>
        {title}
      </h3>

      {/* Totals — all stats inline in a single row/bar */}
      <div className="totals-bar">
        {cols.map((c) => {
          const bd = buildBreakdown(c, totals)
          return (
            <div key={c.key} className={`totals-item ${bd ? 'has-popup' : ''}`}>
              <span className="totals-item-label">{c.label}</span>
              <span className="totals-item-value">{totals?.[c.key] ?? 0}</span>
              {bd && <StatPopup rows={bd} />}
            </div>
          )
        })}
      </div>

      {/* Per-activity grid */}
      {rows.length === 0 ? (
        <p className="breakdown-empty">No clears.</p>
      ) : (
        <div className="activity-grid" style={{ ['--activity-cols' as any]: columns }}>
          {rows.map((r) => {
            const def = resolveDef(PANTHEON_BANNER_RAID[r.name] || r.name)
            return (
              <div key={r.name} className="activity-card">
                <div
                  className="activity-card-banner"
                  style={
                    def?.bg
                      ? {
                          backgroundImage: `linear-gradient(rgba(11,16,23,0.2), rgba(11,16,23,0.85)), url(${def.bg})`
                        }
                      : undefined
                  }
                >
                  <span className="activity-card-name" title={r.name}>
                    {r.name}
                  </span>
                </div>
                <div className="activity-card-stats">
                  {cols.map((c) => {
                    const bd = buildBreakdown(c, r)
                    return (
                      <div key={c.key} className={`acs ${bd ? 'has-popup' : ''}`}>
                        <span className="acs-value">{r[c.key] ?? 0}</span>
                        <span className="acs-label">{c.label}</span>
                        {bd && <StatPopup rows={bd} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
