import { useState, useEffect, useMemo } from 'react'
import { formatDuration, formatDate } from '../utils/format'
import { getSpeedBadge } from '../utils/matchActivities'
import { loadUiPref } from '../utils/theme'
import '../styles/activity.css'

const PAGE_SIZE = 50

const TEAM_FILTERS = [
  { id: 'all', label: 'Any size' },
  { id: 'solo', label: 'Solo', count: 1 },
  { id: 'duo', label: 'Duo', count: 2 },
  { id: 'trio', label: 'Trio', count: 3, title: 'Raids only' }
]

export default function Activity({ activities = [], state = 'idle', error = '', onOpen }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [activityFilter, setActivityFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [flawlessOnly, setFlawlessOnly] = useState(false)
  const [completedOnly, setCompletedOnly] = useState(false)

  const hideIncomplete = loadUiPref().hideIncomplete

  // Distinct activity names present, for the dropdown.
  const activityNames = useMemo(() => {
    const set = new Set<string>()
    for (const a of activities) if (a.activityName) set.add(a.activityName)
    return [...set].sort()
  }, [activities])

  const filtersActive =
    activityFilter !== 'all' || teamFilter !== 'all' || flawlessOnly || completedOnly

  const visible = useMemo(() => {
    const teamCount = TEAM_FILTERS.find((t) => t.id === teamFilter)?.count
    return activities.filter((a) => {
      if (hideIncomplete && !a.completed) return false
      if (completedOnly && !a.completed) return false
      if (activityFilter !== 'all' && a.activityName !== activityFilter) return false
      if (flawlessOnly && !a.flawless) return false
      if (teamCount && a.playerCount !== teamCount) return false
      // A "trio" is only a flex in raids (dungeons are 3-player by default).
      if (teamFilter === 'trio' && a.mode !== 'raid') return false
      return true
    })
  }, [activities, hideIncomplete, completedOnly, activityFilter, flawlessOnly, teamFilter])

  // Reset pagination whenever the filters change.
  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [activityFilter, teamFilter, flawlessOnly, completedOnly])

  const shown = visible.slice(0, limit)

  return (
    <div className="activity">
      <header className="activity-header">
        <h2 className="activity-heading">Recent Runs</h2>
        <span className="activity-count">
          {state === 'done'
            ? `${visible.length}${filtersActive ? ' matching' : ''} ${
                hideIncomplete ? 'completed ' : ''
              }activities`
            : ''}
        </span>
      </header>

      {state === 'done' && activities.length > 0 && (
        <div className="run-filters">
          <select
            className="run-filter-select"
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
          >
            <option value="all">All activities</option>
            {activityNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div className="run-filter-chips">
            {TEAM_FILTERS.map((t) => (
              <button
                key={t.id}
                className={`run-chip ${teamFilter === t.id ? 'is-active' : ''}`}
                onClick={() => setTeamFilter(t.id)}
                title={t.title}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            className={`run-chip ${flawlessOnly ? 'is-active' : ''}`}
            onClick={() => setFlawlessOnly((v) => !v)}
          >
            ✦ Flawless
          </button>
          {!hideIncomplete && (
            <button
              className={`run-chip ${completedOnly ? 'is-active' : ''}`}
              onClick={() => setCompletedOnly((v) => !v)}
            >
              ✓ Completed
            </button>
          )}
          {filtersActive && (
            <button
              className="run-chip run-chip-clear"
              onClick={() => {
                setActivityFilter('all')
                setTeamFilter('all')
                setFlawlessOnly(false)
                setCompletedOnly(false)
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {state === 'loading' && (
        <div className="activity-status">
          <span className="spinner" /> Loading raids &amp; dungeons and their reports… (first load can
          take a moment)
        </div>
      )}

      {state === 'error' && (
        <div className="activity-status is-error">Couldn’t load activities: {error}</div>
      )}

      {state === 'done' && visible.length === 0 && (
        <div className="activity-status">
          {filtersActive
            ? 'No runs match the current filters.'
            : hideIncomplete && activities.length > 0
              ? 'No completed runs to show (incomplete runs are hidden).'
              : 'No raid or dungeon activities found on this account.'}
        </div>
      )}

      {shown.length > 0 && (
        <>
          <p className="activity-note">
            Each run is mapped to its raid / dungeon and difficulty. Click a run to open its full
            Post Game Carnage Report.
          </p>
          <ul className="activity-feed">
            {shown.map((item) => {
              // 5-star run: a full (fresh) clear, flawless, or a low-man
              // (raid < 3 players, dungeon solo).
              const lowman = item.mode === 'raid' ? item.playerCount < 3 : item.playerCount <= 1
              const starred = item.completed && (item.fresh || item.flawless || lowman)
              const speedBadge = getSpeedBadge(item.activityName, item.durationSeconds)
              return (
              <li
                key={item.instanceId}
                className={`activity-item is-clickable ${starred ? 'is-starred' : ''}`}
              >
                <button className="activity-rowbtn" onClick={() => onOpen?.(item.instanceId)}>
                  <span className="activity-icon" aria-hidden="true">
                    {item.mode === 'raid' ? '⚔' : '☠'}
                  </span>
                  <div className="activity-body">
                    <div className="activity-line">
                      <span className="activity-game">
                        {item.activityName || (item.mode === 'raid' ? 'Raid' : 'Dungeon')}
                        {speedBadge && (
                          <span className="speed-badge" title={speedBadge.label}>
                            {speedBadge.icon}
                          </span>
                        )}
                        {starred && (
                          <span className="run-stars" title="Full / flawless / low-man">
                            ★
                          </span>
                        )}
                      </span>
                      <span className="activity-date">{formatDate(item.period)}</span>
                    </div>
                    <p className="activity-title">
                      {item.completed ? 'Completed' : 'Incomplete'}
                      <span className="activity-pill">{formatDuration(item.durationSeconds)}</span>
                      <span className={`activity-tag ${item.mode === 'raid' ? 'tag-raid' : 'tag-dungeon'}`}>
                        {item.mode}
                      </span>
                      {item.difficulty && item.difficulty !== 'normal' && (
                        <span className={`activity-tag tag-${item.difficulty}`}>{item.difficulty}</span>
                      )}
                    </p>
                    <p className="activity-detail">
                      {item.kills} kills · {item.deaths} deaths · {item.assists} assists ·{' '}
                      instance {item.instanceId}
                    </p>
                  </div>
                  <span className="activity-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
              )
            })}
          </ul>

          {limit < visible.length && (
            <button className="activity-more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Show more ({visible.length - limit} remaining)
            </button>
          )}
        </>
      )}
    </div>
  )
}
