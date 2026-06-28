import { useEffect, useState } from 'react'
import { formatDuration, formatDate } from '../utils/format'
import { resolveDef } from '../data/activityDefs'
import '../styles/pgcr.css'

export default function PgcrDetail({ instanceId, onBack }) {
  const [state, setState] = useState('loading') // loading | done | error
  const [pgcr, setPgcr] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!instanceId || !window.api?.getPgcr) return
    let cancelled = false

    setState('loading')
    window.api
      .getPgcr(instanceId)
      .then((res) => {
        if (cancelled) return
        if (res?.ok && res.pgcr) {
          setPgcr(res.pgcr)
          setState('done')
        } else {
          setError(res?.error || 'No report returned.')
          setState('error')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [instanceId])

  const bg = state === 'done' && pgcr ? resolveDef(pgcr.activityName)?.bg : null

  return (
    <div className="pgcr">
      {bg && (
        <div
          className="pgcr-backdrop"
          style={{
            backgroundImage: `linear-gradient(rgba(11,16,23,0.5), rgba(11,16,23,0.5)), url(${bg})`
          }}
        />
      )}
      <button className="pgcr-back" onClick={onBack}>
        ‹ Back to runs
      </button>

      {state === 'loading' && (
        <div className="activity-status">
          <span className="spinner" /> Loading carnage report…
        </div>
      )}
      {state === 'error' && <div className="activity-status is-error">Couldn’t load report: {error}</div>}

      {state === 'done' && pgcr && (
        <>
          <header className="pgcr-header">
            <h2 className="pgcr-title">
              {pgcr.activityName || `Activity ${pgcr.instanceId}`}
              {pgcr.difficulty && pgcr.difficulty !== 'normal' && (
                <span className={`activity-tag tag-${pgcr.difficulty}`}>{pgcr.difficulty}</span>
              )}
            </h2>
            <div className="pgcr-meta">
              {pgcr.mode && <span className="pgcr-mode">{pgcr.mode}</span>}
              <span>{formatDate(pgcr.period)}</span>
              <span>{formatDuration(pgcr.durationSeconds)}</span>
              <span>{pgcr.players.length} players</span>
            </div>
          </header>

          <table className="pgcr-table">
            <thead>
              <tr>
                <th>Guardian</th>
                <th>Class</th>
                <th>Done</th>
                <th>Kills</th>
                <th>Deaths</th>
                <th>Assists</th>
                <th>K/D</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {pgcr.players.map((p, i) => (
                <tr key={`${p.membershipId}-${p.characterId}-${i}`}>
                  <td className="pgcr-name">
                    {p.emblem && <img className="pgcr-emblem" src={p.emblem} alt="" />}
                    <span>{p.name}</span>
                  </td>
                  <td>{p.className}</td>
                  <td>{p.completed ? '✓' : '—'}</td>
                  <td>{p.kills}</td>
                  <td>{p.deaths}</td>
                  <td>{p.assists}</td>
                  <td>{p.kd?.toFixed?.(2) ?? p.kd}</td>
                  <td>{formatDuration(p.timePlayedSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
