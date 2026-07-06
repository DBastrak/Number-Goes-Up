import { computeClassStats } from '../utils/stats'
import { matchActivities } from '../utils/matchActivities'
import { computeActivityStats } from '../utils/activityStats'
import { ActivitySection, RAID_COLS, DUNGEON_COLS } from '../components/ActivityStats'
import '../styles/library.css'

// The fastest completed run of this activity matching an achievement badge
// (Flawless = flawless full clear; Solo/Duo/Trio = that fireteam size).
function findFastestBadgeRun(activities, name, badge) {
  const size = { Solo: 1, Duo: 2, Trio: 3 }[badge]
  let best = null
  for (const a of activities) {
    if (!a.completed || a.activityName !== name) continue
    if (badge === 'Flawless') {
      if (!(a.flawless && a.fresh)) continue
    } else if (a.playerCount !== size) continue
    if (!best || a.durationSeconds < best.durationSeconds) best = a
  }
  return best
}

export default function Library({
  activities = [],
  characterClasses,
  state = 'idle',
  error = '',
  onOpenRun
}) {
  const actStats = state === 'done' ? computeActivityStats(activities) : null
  const classStats = state === 'done' ? computeClassStats(activities, characterClasses) : null
  const unmatched = state === 'done' ? matchActivities(activities).unmatched : []

  function openBadgeRun(row, badge) {
    const run = findFastestBadgeRun(activities, row.name, badge)
    if (run) onOpenRun?.(run.instanceId)
  }

  return (
    <section className="library-main">
      {state === 'loading' && (
        <div className="activity-status">
          <span className="spinner" /> Loading raids &amp; dungeons and their reports… (first load can
          take a moment)
        </div>
      )}
      {state === 'error' && (
        <div className="activity-status is-error">Couldn’t load stats: {error}</div>
      )}
      {state === 'idle' && <div className="activity-status">Sign in to load your stats.</div>}

      {state === 'done' && actStats && (
        <>
          <ActivitySection
            title="Raids"
            cls="tag-raid"
            totals={actStats.raidTotals}
            rows={actStats.raids}
            cols={RAID_COLS}
            columns={3}
            onBadge={openBadgeRun}
          />
          {actStats.pantheon.length > 0 && (
            <ActivitySection
              title="Pantheon"
              cls="tag-master"
              totals={actStats.pantheonTotals}
              rows={actStats.pantheon}
              cols={RAID_COLS}
              columns={3}
              onBadge={openBadgeRun}
            />
          )}
          <ActivitySection
            title="Dungeons"
            cls="tag-dungeon"
            totals={actStats.dungeonTotals}
            rows={actStats.dungeons}
            cols={DUNGEON_COLS}
            columns={3}
            onBadge={openBadgeRun}
          />
          {classStats && classStats.length > 0 && <ClassTable classStats={classStats} />}
          {unmatched.length > 0 && <UnmatchedNote items={unmatched} />}
        </>
      )}
    </section>
  )
}

function ClassTable({ classStats }: any) {
  return (
    <section className="class-stats">
      <h3 className="activity-tag tag-contest" style={{ fontSize: '20px' }}>
        Stats by class
      </h3>
      <table className="class-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Raid clears</th>
            <th>Raid full</th>
            <th>Dungeon clears</th>
            <th>Dungeon full</th>
          </tr>
        </thead>
        <tbody>
          {classStats.map((c) => (
            <tr key={c.class}>
              <td className="class-name">{c.class}</td>
              <td>{c.raidClears}</td>
              <td>{c.raidFull}</td>
              <td>{c.dungeonClears}</td>
              <td>{c.dungeonFull}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function UnmatchedNote({ items }: any) {
  return (
    <section className="unmatched-note">
      <h3 className="stats-title">Unmatched activities ({items.length})</h3>
      <p className="stats-page-sub">
        These finished clears didn’t map to a known raid/dungeon — worth investigating (likely a new
        difficulty variant or activity).
      </p>
      <ul className="unmatched-list">
        {items.map((u) => (
          <li key={u.name}>
            <code>{u.name}</code> — {u.count} clears · ref {u.referenceId} · {u.mode}
          </li>
        ))}
      </ul>
    </section>
  )
}
