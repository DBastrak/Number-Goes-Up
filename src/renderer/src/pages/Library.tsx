import { useState } from 'react'
import { computeStats, computeClassStats } from '../utils/stats'
import { matchActivities } from '../utils/matchActivities'
import { formatDate } from '../utils/format'
import '../styles/library.css'

const SECTIONS = [
  { id: 'all', label: 'All' },
  { id: 'raid', label: 'Raid' },
  { id: 'dungeon', label: 'Dungeon' }
]

export default function Library({
  activities = [],
  totals,
  characterClasses,
  state = 'idle',
  error = ''
}) {
  const [section, setSection] = useState('all')
  const stats = state === 'done' ? computeStats(activities, totals) : null
  const matched = state === 'done' ? matchActivities(activities) : null
  const classStats = state === 'done' ? computeClassStats(activities, characterClasses) : null

  return (
    <div className="library">
      <aside className="library-sidebar">
        <nav className="library-sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`library-section ${s.id === section ? 'is-active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="library-section-label">{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

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

        {section === 'all' && stats && (
          <GeneralStats stats={stats} classStats={classStats} unmatched={matched?.unmatched || []} />
        )}
        {section === 'raid' && matched && <Accordion title="Raids" icon="⚔" rows={matched.raids} />}
        {section === 'dungeon' && matched && (
          <Accordion title="Dungeons" icon="☠" rows={matched.dungeons} />
        )}
      </section>
    </div>
  )
}

function GeneralStats({ stats, classStats, unmatched }) {
  return (
    <>
      <header className="stats-page-header">
        <h2 className="stats-page-heading">Overview</h2>
        <p className="stats-page-sub">General raid &amp; dungeon stats across your account.</p>
      </header>

      <div className="stats-wrap">
        <section className="stats-group">
          <h3 className="stats-title">
            <span className="activity-tag tag-raid">Raids</span>
            {stats.raid.total} total clears
          </h3>
          <div className="stats-grid">
            <StatBox value={stats.raid.total} label="Total clears" hint="Every finished run" />
            <StatBox
              value={stats.raid.full}
              label="Full clears"
            />
            <StatBox value={stats.raid.flawless} label="Flawless" hint="No one died" />
            <StatBox value={stats.raid.p3} label="3-player" />
            <StatBox value={stats.raid.p2} label="2-player" />
            <StatBox value={stats.raid.p1} label="Solo (1-player)" />
          </div>
        </section>

        <section className="stats-group">
          <h3 className="stats-title">
            <span className="activity-tag tag-dungeon">Dungeons</span>
            {stats.dungeon.total} total clears
          </h3>
          <div className="stats-grid">
            <StatBox value={stats.dungeon.total} label="Total clears" hint="Every finished run" />
            <StatBox
              value={stats.dungeon.full}
              label="Full clears"
            />
            <StatBox value={stats.dungeon.solo} label="Solo (1-player)" />
            <StatBox value={stats.dungeon.flawless} label="Flawless" hint="No one died" />
            <StatBox value={stats.dungeon.soloFlawless} label="Solo flawless" hint="Solo + no deaths" />
          </div>
        </section>
      </div>

      {classStats && classStats.length > 0 && (
        <section className="class-stats">
          <h3 className="stats-title">Stats by class</h3>
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
      )}

      {unmatched.length > 0 && <UnmatchedNote items={unmatched} />}
    </>
  )
}

function Accordion({ title, icon, rows }) {
  const [openName, setOpenName] = useState(null)

  return (
    <>
      <header className="stats-page-header">
        <h2 className="stats-page-heading">{title}</h2>
        <p className="stats-page-sub">Select an activity to see its specific stats.</p>
      </header>

      <div className="activity-accordion">
        {rows.map((row) => {
          const open = openName === row.def.name
          const cleared = row.total > 0
          return (
            <article
              key={row.def.name}
              className={`accordion-item ${open ? 'is-open' : ''} ${cleared ? '' : 'is-empty'} ${row.def.bg ? 'has-bg' : ''}`}
              style={
                row.def.bg
                  ? {
                      backgroundImage: `linear-gradient(rgba(11,16,23,0.55), rgba(11,16,23,0.55)), url(${row.def.bg})`
                    }
                  : undefined
              }
            >
              <button
                className="accordion-head"
                onClick={() => setOpenName(open ? null : row.def.name)}
                aria-expanded={open}
              >
                <span className="accordion-art" aria-hidden="true">
                  {icon}
                </span>
                <span className="accordion-titlewrap">
                  <span className="accordion-title">{row.def.name}</span>
                </span>
                <span className="accordion-summary">
                  <span>{row.total} clears</span>
                  <span className="dim">{row.full} full</span>
                </span>
                <span className={`accordion-chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
                  ▾
                </span>
              </button>

              {open && (
                <div className="accordion-panel">
                  <div className="encounter-row encounter-head">
                    <span>Released {formatDate(row.def.releaseDate).split(',')[0]}</span>
                    <span>Clears</span>
                  </div>
                  <DetailRow label="Total clears" value={row.total} />
                  <DetailRow label="Full clears (fresh)" value={row.full} />
                  <DetailRow label="Day-one clears" value={row.dayOne}/>
                  <DetailRow label="Challenge / Master clears" value={row.challenge}/>
                  {Object.entries(row.byDifficulty).map(([diff, n]) => (
                    <DetailRow key={diff} label={`· ${diff}`} value={n} sub />
                  ))}
                  {row.lastCleared && (
                    <DetailRow label="Last cleared" value={formatDate(row.lastCleared)} />
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}

function DetailRow({ label, value, hint, sub }: any) {
  return (
    <div className={`encounter-row ${sub ? 'is-sub' : ''}`}>
      <span className="encounter-name">
        {label}
        {hint && <span className="detail-flag">{hint}</span>}
      </span>
      <span>{value}</span>
    </div>
  )
}

function UnmatchedNote({ items }) {
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

function StatBox({ value, label, hint }: any) {
  return (
    <div className="stat-box">
      <span className="stat-box-value">{value}</span>
      <span className="stat-box-label">{label}</span>
      {hint && <span className="stat-box-hint">{hint}</span>}
    </div>
  )
}
