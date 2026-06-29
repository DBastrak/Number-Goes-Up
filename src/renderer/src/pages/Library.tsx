import { computeClassStats } from '../utils/stats'
import { matchActivities } from '../utils/matchActivities'
import { computeActivityStats } from '../utils/activityStats'
import { ActivitySection, RAID_COLS, DUNGEON_COLS } from '../components/ActivityStats'
import '../styles/library.css'

export default function Library({ activities = [], characterClasses, state = 'idle', error = '' }) {
  const actStats = state === 'done' ? computeActivityStats(activities) : null
  const classStats = state === 'done' ? computeClassStats(activities, characterClasses) : null
  const unmatched = state === 'done' ? matchActivities(activities).unmatched : []

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
          />
          {actStats.pantheon.length > 0 && (
            <ActivitySection
              title="Pantheon"
              cls="tag-master"
              totals={actStats.pantheonTotals}
              rows={actStats.pantheon}
              cols={RAID_COLS}
              columns={3}
            />
          )}
          <ActivitySection
            title="Dungeons"
            cls="tag-dungeon"
            totals={actStats.dungeonTotals}
            rows={actStats.dungeons}
            cols={DUNGEON_COLS}
            columns={3}
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
