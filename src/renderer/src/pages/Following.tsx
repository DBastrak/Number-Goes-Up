import { useState, useEffect, useCallback } from 'react'
import { resolveDef } from '../data/activityDefs'
import '../styles/following.css'

export default function Following() {
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('')
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [profiles, setProfiles] = useState({}) // membershipId -> { stats, breakdown }

  const loadProfile = useCallback(async (u) => {
    setProfiles((p) => ({
      ...p,
      [u.membershipId]: {
        stats: p[u.membershipId]?.stats || { state: 'loading' },
        breakdown: p[u.membershipId]?.breakdown || { state: 'loading' }
      }
    }))
    // Stats (fast) + per-activity breakdown (slower) in parallel.
    window.api?.followingStats?.(u.membershipType, u.membershipId).then((res) =>
      setProfiles((p) => ({
        ...p,
        [u.membershipId]: {
          ...p[u.membershipId],
          stats: res?.ok
            ? { state: 'done', raid: res.raid, dungeon: res.dungeon, characters: res.characters }
            : { state: res?.private ? 'private' : 'error', error: res?.error || 'Failed to load.' }
        }
      }))
    )
    window.api?.followingBreakdown?.(u.membershipType, u.membershipId).then((res) =>
      setProfiles((p) => ({
        ...p,
        [u.membershipId]: {
          ...p[u.membershipId],
          breakdown: res?.ok
            ? {
                state: 'done',
                raids: res.raids,
                dungeons: res.dungeons,
                raidTotals: res.raidTotals,
                dungeonTotals: res.dungeonTotals
              }
            : { state: res?.private ? 'private' : 'error', error: res?.error || 'Failed to load.' }
        }
      }))
    )
  }, [])

  function select(u) {
    setSelectedId(u.membershipId)
    if (!profiles[u.membershipId]) loadProfile(u)
  }

  useEffect(() => {
    let cancelled = false
    window.api?.followingList?.().then((saved) => {
      if (!cancelled) setList(saved || [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function addUser(e) {
    e?.preventDefault?.()
    const name = input.trim()
    if (!name || adding) return
    if (typeof window.api?.followingAdd !== 'function') {
      setAddError('Following needs a full app restart to load (close and reopen the app).')
      return
    }
    setAdding(true)
    setAddError('')
    try {
      const res = await window.api.followingAdd(name)
      if (res?.ok) {
        setList((l) => [...l, res.entry])
        setInput('')
        select(res.entry)
      } else {
        setAddError(res?.error || 'Could not add that Guardian.')
      }
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function removeUser(membershipId) {
    await window.api?.followingRemove?.(membershipId)
    setList((l) => l.filter((u) => u.membershipId !== membershipId))
    if (selectedId === membershipId) setSelectedId(null)
  }

  const filtered = list.filter((u) => u.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const selected = list.find((u) => u.membershipId === selectedId)

  return (
    <div className="following">
      <aside className="following-side">
        <form className="following-add" onSubmit={addUser}>
          <input
            className="following-input"
            placeholder="Search + add  (Name#1234)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="following-add-btn" type="submit" disabled={adding || !input.trim()}>
            {adding ? '…' : 'Add'}
          </button>
        </form>
        {addError && <p className="following-error">{addError}</p>}

        <input
          className="following-filter"
          placeholder="Search: Follow"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <nav className="following-names">
          {list.length === 0 && <p className="following-hint">Not following anyone yet.</p>}
          {list.length > 0 && filtered.length === 0 && (
            <p className="following-hint">No matches.</p>
          )}
          {filtered.map((u) => (
            <button
              key={u.membershipId}
              className={`following-name-btn ${selectedId === u.membershipId ? 'is-active' : ''}`}
              onClick={() => select(u)}
            >
              {u.name}
            </button>
          ))}
        </nav>
      </aside>

      <section className="following-main">
        {!selected ? (
          <div className="following-placeholder">Select a Guardian to view their profile.</div>
        ) : (
          <Profile user={selected} data={profiles[selectedId]} onRemove={() => removeUser(selectedId)} />
        )}
      </section>
    </div>
  )
}

// Column = a stat field shown both in the section totals row and per-activity cards.
// `popup` adds a hover breakdown: 'diff' splits clears/full by difficulty (from `src`),
// 'size' splits low-mans by fireteam size. The 3rd column is "Low-man" for raids (≤3) with
// a solo/duo/trio popup, and "Solo" for dungeons (1, no popup needed).
const RAID_COLS = [
  { key: 'clears', label: 'Clears', popup: 'diff', src: 'clearsByDiff' },
  { key: 'full', label: 'Full', popup: 'diff', src: 'fullByDiff' },
  { key: 'lowman', label: 'Low-man', popup: 'size', src: 'lowmanBySize' },
  { key: 'flawless', label: 'Flawless' }
]
const DUNGEON_COLS = [
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

function Profile({ user, data, onRemove }) {
  const stats = data?.stats || { state: 'loading' }
  const breakdown = data?.breakdown || { state: 'loading' }
  const total = (stats.raid || 0) + (stats.dungeon || 0)
  const isPrivate = stats.state === 'private' || breakdown.state === 'private'

  return (
    <div className="profile">
      <header className="profile-head">
        <div>
          <h2 className="profile-name">{user.name}</h2>
          {stats.state === 'done' && (
            <p className="profile-sub">{stats.characters} characters · {total} total clears</p>
          )}
        </div>
        <button className="profile-remove" onClick={onRemove}>
          Unfollow
        </button>
      </header>

      {isPrivate ? (
        <div className="profile-private">
          <div className="profile-private-icon">🔒</div>
          <p className="profile-private-title">This account is private</p>
          <p className="profile-private-sub">
            {user.name} hides their Destiny stats, so their clears can’t be shown. They can change
            this in Bungie.net → Settings → Privacy.
          </p>
        </div>
      ) : breakdown.state === 'loading' ? (
        <div className="following-loading">
          <span className="spinner" /> Crunching clears… (the first look at a Guardian can take a
          while)
        </div>
      ) : breakdown.state === 'error' ? (
        <div className="following-error">Couldn’t load: {breakdown.error}</div>
      ) : breakdown.state === 'done' ? (
        <>
          <ActivitySection
            title="Raids"
            cls="tag-raid"
            totals={breakdown.raidTotals}
            rows={breakdown.raids}
            cols={RAID_COLS}
          />
          <ActivitySection
            title="Dungeons"
            cls="tag-dungeon"
            totals={breakdown.dungeonTotals}
            rows={breakdown.dungeons}
            cols={DUNGEON_COLS}
          />
        </>
      ) : null}
    </div>
  )
}

function ActivitySection({ title, cls, totals, rows = [], cols }: any) {
  return (
    <section className="profile-section">
      <h3 className={`activity-tag ${cls}`}>{title}</h3>

      {/* Totals row */}
      <div className="stat-grid stat-grid-totals">
        {cols.map((c) => {
          const bd = buildBreakdown(c, totals)
          return (
            <div key={c.key} className={`stat-tile ${bd ? 'has-popup' : ''}`}>
              <span className="stat-tile-value">{totals?.[c.key] ?? 0}</span>
              <span className="stat-tile-label">{c.label}</span>
              {bd && <StatPopup rows={bd} />}
            </div>
          )
        })}
      </div>

      {/* Per-activity grid */}
      {rows.length === 0 ? (
        <p className="breakdown-empty">No clears.</p>
      ) : (
        <div className="activity-grid">
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
