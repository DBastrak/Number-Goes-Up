import { useState, useEffect, useCallback } from 'react'
import { ActivitySection, RAID_COLS, DUNGEON_COLS } from '../components/ActivityStats'
import '../styles/following.css'

// Loaded profiles are kept at module level so they survive the component unmounting when
// you switch tabs — a Guardian's page only loads once per app session. The selection is
// remembered too, so coming back to the tab restores the profile you were viewing.
let profileCache = {} // membershipId -> { stats, breakdown }
let lastSelectedId = null

export default function Following({ onOpenRun }) {
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('')
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [selectedId, setSelectedIdState] = useState(lastSelectedId)
  const [profiles, setProfilesState] = useState(profileCache)

  const setSelectedId = (id) => {
    lastSelectedId = id
    setSelectedIdState(id)
  }
  // State setter that mirrors every update into the module-level cache.
  const setProfiles = useCallback((updater) => {
    setProfilesState((p) => {
      profileCache = typeof updater === 'function' ? updater(p) : updater
      return profileCache
    })
  }, [])

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
                pantheon: res.pantheon,
                raidTotals: res.raidTotals,
                dungeonTotals: res.dungeonTotals,
                pantheonTotals: res.pantheonTotals
              }
            : { state: res?.private ? 'private' : 'error', error: res?.error || 'Failed to load.' }
        }
      }))
    )
  }, [setProfiles])

  function select(u) {
    setSelectedId(u.membershipId)
    // Load once per session (cached); retry only if a previous attempt failed.
    const cached = profiles[u.membershipId]
    const failed =
      cached && (cached.stats?.state === 'error' || cached.breakdown?.state === 'error')
    if (!cached || failed) loadProfile(u)
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
    // Drop the cached profile so re-following starts fresh.
    setProfiles((p) => {
      const next = { ...p }
      delete next[membershipId]
      return next
    })
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
          <Profile
            user={selected}
            data={profiles[selectedId]}
            onRemove={() => removeUser(selectedId)}
            onOpenRun={onOpenRun}
          />
        )}
      </section>
    </div>
  )
}

function Profile({ user, data, onRemove, onOpenRun }) {
  const stats = data?.stats || { state: 'loading' }
  const breakdown = data?.breakdown || { state: 'loading' }
  const total = (stats.raid || 0) + (stats.dungeon || 0)
  const isPrivate = stats.state === 'private' || breakdown.state === 'private'

  // Badge click → this Guardian's fastest run matching the achievement (precomputed by
  // the main process as fastestByBadge on each row).
  const openBadgeRun =
    onOpenRun &&
    ((row, badge) => {
      const run = row.fastestByBadge?.[badge]
      if (run?.instanceId) onOpenRun(run.instanceId)
    })

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
            onBadge={openBadgeRun}
          />
          {breakdown.pantheon?.length > 0 && (
            <ActivitySection
              title="Pantheon"
              cls="tag-master"
              totals={breakdown.pantheonTotals}
              rows={breakdown.pantheon}
              cols={RAID_COLS}
              onBadge={openBadgeRun}
            />
          )}
          <ActivitySection
            title="Dungeons"
            cls="tag-dungeon"
            totals={breakdown.dungeonTotals}
            rows={breakdown.dungeons}
            cols={DUNGEON_COLS}
            onBadge={openBadgeRun}
          />
        </>
      ) : null}
    </div>
  )
}

