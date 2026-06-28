import { useState, useEffect } from 'react'
import '../styles/live.css'

const POLL_MS = 1000

// Persist the last result across tab switches so re-opening the tab shows data
// immediately instead of flashing the loading spinner.
let cachedLive = null

function formatElapsed(ms) {
  if (ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export default function LiveActivity() {
  const [live, setLive] = useState(cachedLive)
  const [state, setState] = useState(cachedLive ? 'done' : 'loading') // loading | done | error
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  // Poll the live activity endpoint.
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await window.api?.getLiveActivity?.()
        if (cancelled) return
        if (res?.ok) {
          cachedLive = res
          setLive(res)
          setState('done')
        } else {
          setError(res?.error || 'Failed to load live activity.')
          setState('error')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setState('error')
        }
      }
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Tick the timer every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = live?.startedAt ? now - Date.parse(live.startedAt) : 0

  return (
    <div className="live">
      {live?.inActivity &&
        (live.isOrbit ? (
          <div className="live-backdrop is-orbit" />
        ) : (
          live.background && (
            <div
              className="live-backdrop"
              style={{
                backgroundImage: `linear-gradient(rgba(11,16,23,0.5), rgba(11,16,23,0.5)), url(${live.background})`
              }}
            />
          )
        ))}
      <header className="live-header">
        <h2 className="live-heading">
          Live Activity
          <span className={`live-dot ${live?.inActivity ? 'is-on' : ''}`} />
        </h2>
        <span className="live-poll">Auto-refreshing every {POLL_MS / 1000}s</span>
      </header>

      {state === 'loading' && !live && (
        <div className="activity-status">
          <span className="spinner" /> Checking your current activity…
        </div>
      )}
      {state === 'error' && (
        <div className="activity-status is-error">Couldn’t check live activity: {error}</div>
      )}

      {state !== 'loading' && live && !live.inActivity && (
        <div className="live-idle">
          <div className="live-idle-icon">🛰️</div>
          <p className="live-idle-title">Not currently in an activity</p>
          {live.lastPlayed && (
            <p className="live-idle-sub">
              Last played {new Date(live.lastPlayed).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {live?.inActivity && (
        <>
          <section className="live-card">
            <div className="live-card-top">
              {live.activityType && (
                <span
                  className={`activity-tag ${
                    /raid/i.test(live.activityType)
                      ? 'tag-raid'
                      : /dungeon/i.test(live.activityType)
                        ? 'tag-dungeon'
                        : ''
                  }`}
                >
                  {live.activityType}
                </span>
              )}
              <span className="live-class">{live.character?.class}</span>
            </div>
            <h3 className="live-activity-name">{live.activityName}</h3>
            {live.isOrbit ? (
              <div className="live-timer live-orbit">In Orbit</div>
            ) : (
              <>
                <div className="live-timer">{formatElapsed(elapsed)}</div>
                <span className="live-timer-label">In activity</span>
              </>
            )}
          </section>

          <section className="live-section">
            <h4 className="live-section-title">Equipped weapons</h4>
            <div className="loadout-grid">
              {live.loadout?.weapons?.length ? (
                live.loadout.weapons.map((w, i) => (
                  <div key={i} className={`loadout-item ${w.exotic ? 'is-exotic' : ''}`}>
                    {w.icon && <img className="loadout-icon" src={w.icon} alt="" />}
                    <span className="loadout-name">{w.name}</span>
                  </div>
                ))
              ) : (
                <p className="live-muted">No weapon data (equipment may be private).</p>
              )}
            </div>
          </section>

          <section className="live-section">
            <h4 className="live-section-title">Exotic armour</h4>
            <div className="loadout-grid">
              {live.loadout?.exoticArmor?.length ? (
                live.loadout.exoticArmor.map((a, i) => (
                  <div key={i} className="loadout-item is-exotic">
                    {a.icon && <img className="loadout-icon" src={a.icon} alt="" />}
                    <span className="loadout-name">{a.name}</span>
                  </div>
                ))
              ) : (
                <p className="live-muted">No exotic armour equipped.</p>
              )}
            </div>
          </section>

          <section className="live-section">
            <h4 className="live-section-title">Fireteam</h4>
            {live.fireteam?.length ? (
              <ul className="fireteam-list">
                {live.fireteam.map((m, i) => {
                  const items = [
                    ...(m.loadout?.weapons || []),
                    ...(m.loadout?.exoticArmor || [])
                  ]
                  return (
                    <li key={i} className="fireteam-member">
                      {m.emblem ? (
                        <img className="fireteam-emblem" src={m.emblem} alt="" />
                      ) : (
                        <span className="fireteam-avatar">{(m.name || '?').slice(0, 1)}</span>
                      )}
                      <div className="fireteam-info">
                        <span className="fireteam-name">
                          {m.name}
                          {m.self && <span className="fireteam-you">you</span>}
                        </span>
                        {items.length > 0 && (
                          <div className="fireteam-loadout">
                            {items.map((it, j) =>
                              it.icon ? (
                                <img
                                  key={j}
                                  className={`ft-item ${it.exotic ? 'is-exotic' : ''}`}
                                  src={it.icon}
                                  alt=""
                                  title={it.name}
                                />
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="live-muted">
                Fireteam details aren’t available.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
