import { useState, useEffect } from 'react'
import '../styles/vendors.css'

// Vendors: this week's live offerings from Zavala (Vanguard) and Xûr. Needs a Bungie
// sign-in (vendor data is per-account). Armour shows its stat spread; weapons show all
// possible perks per column plus the origin trait and current masterwork.

let vendorsCache = null

function tierClass(tier) {
  return tier === 6 ? 'is-exotic' : tier === 5 ? 'is-legendary' : 'is-rare'
}

function WeaponCard({ w }) {
  return (
    <div className={`vn-weapon ${tierClass(w.tier)}`}>
      <div className="vn-weapon-head">
        <span className={`vn-icon ${tierClass(w.tier)}`}>
          <img src={w.icon} alt="" />
          {w.watermark && <img className="vn-icon-wm" src={w.watermark} alt="" />}
        </span>
        <div className="vn-weapon-meta">
          <span className="vn-weapon-name">{w.name}</span>
          <span className="vn-weapon-type">{w.typeName}</span>
          {w.masterwork && <span className="vn-mw">✦ {w.masterwork}</span>}
        </div>
          <div className="vn-cols">
            {(w.columns || []).map((c, ci) => (
              <div key={ci} className="vn-col">
                <div className="vn-col-label">{c.label}</div>
                  {c.perks.map((p, pi) => (
                  <div key={pi} className="vn-perk" title={p.name}>
                  { p.icon && <img src={p.icon} alt="" />}
                    <span>{p.name}</span>
                  </div>
                  ))}
                </div>
          ))}
          {w.origin && (
            <div className="vn-col is-origin">
              <div className="vn-col-label">Origin</div>
              {w.origin.perks.map((p, pi) => (
                <div key={pi} className="vn-perk" title={p.name}>
                  {p.icon && <img src={p.icon} alt="" />}
                  <span>{p.name}</span>
                </div>
                ))}
            </div>
            )}
        </div>
      </div>
    </div>
  )
}

function ArmorCard({ a }) {
  return (
    <div className={`vn-armor ${tierClass(a.tier)}`}>
      <span className={`vn-icon ${tierClass(a.tier)}`}>
        <img src={a.icon} alt="" />
        {a.watermark && <img className="vn-icon-wm" src={a.watermark} alt="" />}
      </span>
      <div className="vn-armor-meta">
        <span className="vn-armor-name">{a.name}</span>
        <div className="vn-stats">
          {(a.stats || []).map((s, i) => (
            <span key={i} className="vn-stat">
              <span className="vn-stat-name">{s.name}</span>
              <span className="vn-stat-val">{s.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ArmorByClass({ armour }) {
  const classes = [
    { type: 0, name: 'Titan' },
    { type: 1, name: 'Hunter' },
    { type: 2, name: 'Warlock' }
  ]
  return (
    <>
      {classes.map((c) => {
        const items = armour.filter((a) => a.classType === c.type)
        if (!items.length) return null
        return (
          <div key={c.type} className="vn-class-group">
            <h4 className="vn-class-title">
              {c.name} <span className="vn-count">{items.length}</span>
            </h4>
            <div className="vn-armor-grid">
              {items.map((a) => (
                <ArmorCard key={a.hash} a={a} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default function Vendors({ authenticated }) {
  const [data, setData] = useState(vendorsCache)
  const [state, setState] = useState(vendorsCache ? 'done' : 'loading')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('zavala')

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    async function load() {
      if (vendorsCache) return
      setState('loading')
      try {
        const res = await window.api?.vendorsGet?.()
        if (cancelled) return
        if (res?.ok) {
          vendorsCache = res
          setData(res)
          setState('done')
        } else {
          setError(res?.error || 'Failed to load vendors.')
          setState('error')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setState('error')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [authenticated])

  function refresh() {
    vendorsCache = null
    setData(null)
    setState('loading')
    window.api?.vendorsGet?.().then((res) => {
      if (res?.ok) {
        vendorsCache = res
        setData(res)
        setState('done')
      } else {
        setError(res?.error || 'Failed to load vendors.')
        setState('error')
      }
    })
  }

  if (!authenticated) {
    return (
      <div className="vn-gate">
        <div className="vn-gate-icon">🔐</div>
        <p className="vn-gate-title">Vendors need a Bungie sign-in</p>
        <p className="vn-gate-sub">
          Sign out and use “Sign in with Bungie” — vendor offerings are read from your account.
        </p>
      </div>
    )
  }

  const v = tab === 'zavala' ? data?.zavala : data?.xur

  return (
    <div className="vn">
      <header className="vn-toolbar">
        <div className="vn-tabs">
          <button className={`vn-tab ${tab === 'zavala' ? 'is-on' : ''}`} onClick={() => setTab('zavala')}>
            Zavala
          </button>
          <button className={`vn-tab ${tab === 'xur' ? 'is-on' : ''}`} onClick={() => setTab('xur')}>
            Xûr
          </button>
        </div>
        <button className="vn-refresh" onClick={refresh} disabled={state === 'loading'}>
          {state === 'loading' ? 'Loading…' : '⟳ Refresh'}
        </button>
      </header>

      {state === 'loading' && (
        <div className="vn-status">
          <span className="spinner" /> Reading this week’s offerings…
        </div>
      )}
      {state === 'error' && <div className="vn-status is-error">Couldn’t load vendors: {error}</div>}

      {state === 'done' && v && (
        <div className="vn-body">
          {tab === 'xur' && data.xur.here === false && (
            <div className="vn-away">Xûr isn’t in the system right now — he visits on weekends.</div>
          )}

          {v.exotics?.length > 0 && (
            <section className="vn-section">
              <h3 className="vn-section-title">Exotics</h3>
              <div className="vn-weapon-list">
                {v.exotics.map((it) =>
                  it.columns ? <WeaponCard key={it.hash} w={it} /> : <ArmorCard key={it.hash} a={it} />
                )}
              </div>
            </section>
          )}

          {v.weapons?.length > 0 && (
            <section className="vn-section">
              <h3 className="vn-section-title">
                Weapons <span className="vn-count">{v.weapons.length}</span>
              </h3>
              <div className="vn-weapon-list">
                {v.weapons.map((w) => (
                  <WeaponCard key={w.hash} w={w} />
                ))}
              </div>
            </section>
          )}

          {v.armour?.length > 0 && (
            <section className="vn-section">
              <h3 className="vn-section-title">
                Armour <span className="vn-count">{v.armour.length}</span>
              </h3>
              <ArmorByClass armour={v.armour} />
            </section>
          )}

          {!v.exotics?.length && !v.weapons?.length && !v.armour?.length && (
            <div className="vn-away">Nothing on offer from this vendor right now.</div>
          )}
        </div>
      )}
    </div>
  )
}
