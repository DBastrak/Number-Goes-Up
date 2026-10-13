import { useState, useEffect } from 'react'
import '../styles/vendors.css'

// Vendors: this week's live offerings from Zavala (Vanguard) and Xûr. Needs a Bungie
// sign-in (vendor data is per-account). Armour shows its stat spread; weapons show all
// possible perks per column plus the origin trait and current masterwork.
// Destiny 1 mode lists every public vendor (no sign-in) with its stock grouped by category.

const vendorsCache: Record<string, any> = {}

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
          <span className="vn-weapon-type">{w.typeName || w.detail}</span>
          {w.stats?.length > 0 && <StatList stats={w.stats} />}
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

function StatList({ stats }) {
  return (
    <div className="vn-stats">
      {stats.map((s, i) => (
        <span key={i} className="vn-stat">
          <span className="vn-stat-name">{s.name}</span>
          <span className="vn-stat-val">{s.value}</span>
        </span>
      ))}
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
        {a.detail && <span className="vn-weapon-type">{a.detail}</span>}
        <StatList stats={a.stats || []} />
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

// One D1 vendor: each sale category as a section, rolled gear first (perk columns), then the rest.
function D1VendorBody({ vendor }) {
  return (
    <>
      {vendor.nextRefresh && !vendor.nextRefresh.startsWith('9999') && (
        <div className="vn-away">Stock refreshes {new Date(vendor.nextRefresh).toLocaleString()}</div>
      )}
      {vendor.categories.map((category, ci) => {
        const rolled = category.items.filter((it) => it.columns)
        const plain = category.items.filter((it) => !it.columns)
        return (
          <section key={ci} className="vn-section">
            <h3 className="vn-section-title">
              {category.title} <span className="vn-count">{category.items.length}</span>
            </h3>
            {rolled.length > 0 && (
              <div className="vn-weapon-list">
                {rolled.map((it, i) => (
                  <WeaponCard key={i} w={it} />
                ))}
              </div>
            )}
            {plain.length > 0 && (
              <div className="vn-armor-grid">
                {plain.map((it, i) => (
                  <ArmorCard key={i} a={it} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}

export default function Vendors({ authenticated, game = 'd2' }) {
  const isD1 = game === 'd1'
  const canLoad = authenticated || isD1
  const getVendors = isD1 ? window.api?.d1VendorsGet : window.api?.vendorsGet
  const [data, setData] = useState(vendorsCache[game] || null)
  const [state, setState] = useState(vendorsCache[game] ? 'done' : 'loading')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('zavala')
  const [d1VendorHash, setD1VendorHash] = useState(null)

  useEffect(() => {
    if (!canLoad) return
    let cancelled = false
    async function load() {
      if (vendorsCache[game]) return
      setState('loading')
      try {
        const res = await getVendors?.()
        if (cancelled) return
        if (res?.ok) {
          vendorsCache[game] = res
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
  }, [canLoad, game])

  function refresh() {
    delete vendorsCache[game]
    setData(null)
    setState('loading')
    getVendors?.().then((res) => {
      if (res?.ok) {
        vendorsCache[game] = res
        setData(res)
        setState('done')
      } else {
        setError(res?.error || 'Failed to load vendors.')
        setState('error')
      }
    })
  }

  if (!canLoad) {
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

  const v = isD1 ? null : tab === 'zavala' ? data?.zavala : data?.xur
  const d1Vendors = isD1 ? data?.vendors || [] : []
  const d1Vendor = d1Vendors.find((vendor) => vendor.hash === d1VendorHash) || d1Vendors[0]

  return (
    <div className="vn">
      <header className="vn-toolbar">
        <div className="vn-tabs">
          {isD1 ? (
            d1Vendors.map((vendor) => (
              <button
                key={vendor.hash}
                className={`vn-tab ${vendor === d1Vendor ? 'is-on' : ''}`}
                onClick={() => setD1VendorHash(vendor.hash)}
              >
                {vendor.name}
              </button>
            ))
          ) : (
            <>
              <button className={`vn-tab ${tab === 'zavala' ? 'is-on' : ''}`} onClick={() => setTab('zavala')}>
                Zavala
              </button>
              <button className={`vn-tab ${tab === 'xur' ? 'is-on' : ''}`} onClick={() => setTab('xur')}>
                Xûr
              </button>
            </>
          )}
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

      {state === 'done' && isD1 && (
        <div className="vn-body">
          {d1Vendor ? (
            <D1VendorBody vendor={d1Vendor} />
          ) : (
            <div className="vn-away">No Destiny 1 vendors are reporting stock right now.</div>
          )}
        </div>
      )}

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
