import { useState, useEffect, useCallback } from 'react'
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

// Column = a stat field shown both in the section totals row and per-activity cards. The
// 3rd column is labelled "Low-man" for raids (≤3 players) and "Solo" for dungeons (1).
const RAID_COLS = [
  { key: 'clears', label: 'Clears' },
  { key: 'full', label: 'Full' },
  { key: 'lowman', label: 'Low-man' },
  { key: 'flawless', label: 'Flawless' }
]
const DUNGEON_COLS = [
  { key: 'clears', label: 'Clears' },
  { key: 'full', label: 'Full' },
  { key: 'lowman', label: 'Solo' },
  { key: 'flawless', label: 'Flawless' }
]

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
      <h3 className={`profile-section-title ${cls}`}>{title}</h3>

      {/* Totals row */}
      <div className="stat-grid stat-grid-totals">
        {cols.map((c) => (
          <div key={c.key} className="stat-tile">
            <span className="stat-tile-value">{totals?.[c.key] ?? 0}</span>
            <span className="stat-tile-label">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Per-activity grid */}
      {rows.length === 0 ? (
        <p className="breakdown-empty">No clears.</p>
      ) : (
        <div className="activity-grid">
          {rows.map((r) => (
            <div key={r.name} className="activity-card">
              <div className="activity-card-name" title={r.name}>
                {r.name}
              </div>
              <div className="activity-card-stats">
                {cols.map((c) => (
                  <div key={c.key} className="acs">
                    <span className="acs-value">{r[c.key] ?? 0}</span>
                    <span className="acs-label">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
