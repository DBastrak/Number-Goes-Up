import { useState, useEffect } from 'react'
import '../styles/vendors.css'

// Weekly vendor offerings: Xûr's live weekly stock (his weapon page isn't public, so
// mostly exotic armor + any weapons Bungie exposes) and Zavala's weekly focused weapon
// drops. One accordion section per vendor; name-only rows with a perk tooltip on hover.

// Session cache so switching tabs doesn't refetch (main process also caches + persists
// item lookups to disk per manifest version).
let vendorsCache = null

export default function Vendors() {
  const [data, setData] = useState(vendorsCache)
  const [state, setState] = useState(vendorsCache ? 'done' : 'loading')
  const [error, setError] = useState('')
  const [closed, setClosed] = useState({}) // vendorHash -> true (accordion starts open)

  useEffect(() => {
    if (vendorsCache) return
    let cancelled = false
    window.api
      ?.getVendors?.()
      .then((res) => {
        if (cancelled) return
        if (res?.ok) {
          vendorsCache = res
          setData(res)
          setState('done')
        } else {
          setError(res?.error || 'Failed to load vendors.')
          setState('error')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const vendors = data?.vendors || []

  return (
    <div className="vendors">
      <header className="vendors-header">
        <h2 className="vendors-heading">Vendors</h2>
      </header>

      {state === 'loading' && (
        <div className="activity-status">
          <span className="spinner" /> Loading weekly vendor offerings…
        </div>
      )}
      {state === 'error' && (
        <div className="activity-status is-error">Couldn’t load vendors: {error}</div>
      )}
      {state === 'done' && vendors.length === 0 && (
        <div className="activity-status">No vendor data available right now.</div>
      )}

      {vendors.map((v) => {
        const isOpen = !closed[v.hash]
        const groups = [...new Set<string>(v.items.map((i) => i.group))]
        return (
          <section key={v.hash} className="vendor-acc">
            <button
              className="vendor-acc-head"
              onClick={() => setClosed((c) => ({ ...c, [v.hash]: isOpen }))}
            >
              <span className="vendor-acc-title">
                <span className="vendor-acc-name">{v.name}</span>
                {v.subtitle && <span className="vendor-acc-subtitle">{v.subtitle}</span>}
              </span>
              <span className="vendor-acc-count">{v.items.length} items</span>
              <span className={`vendor-acc-chevron ${isOpen ? 'is-open' : ''}`}>›</span>
            </button>

            {isOpen && (
              <div className="vendor-acc-body">
                {groups.map((g) => {
                  const items = v.items.filter((i) => i.group === g)
                  return (
                    <div key={g} className="vendor-group">
                      <h4 className="vendor-group-title">{g}</h4>
                      <div className="vendor-items">
                        {items.map((it, idx) => (
                          <VendorItem key={`${it.itemHash}-${idx}`} item={it} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function VendorItem({ item }) {
  return (
    <div className={`vendor-item tier-${(item.tier || '').toLowerCase()}`}>
      {item.icon && <img className="vendor-item-icon" src={item.icon} alt="" />}
      <span className="vendor-item-name">{item.name}</span>
      {item.typeName && <span className="vendor-item-type">{item.typeName}</span>}

      <div className={`vendor-popup ${item.perkColumns ? 'is-wide' : ''}`}>
        <p className="vendor-popup-name">{item.name}</p>
        <p className="vendor-popup-type">
          {[item.tier, item.className, item.typeName].filter(Boolean).join(' · ')}
        </p>

        {/* Stat table (Health / Melee / Grenade / Super / Class / Weapons) when known */}
        {item.stats?.length > 0 && (
          <div className="vendor-popup-statgrid">
            {item.stats.map((s) => (
              <div key={s.name} className="vendor-popup-stat">
                <span className="vendor-popup-stat-name">{s.name}</span>
                <span className="vendor-popup-stat-value">{s.value}</span>
              </div>
            ))}
          </div>
        )}
        {/* Armor stats roll per drop and aren't in Bungie's public API — say so instead
            of silently showing nothing. */}
        {item.itemType === 2 && !item.stats?.length && (
          <p className="vendor-popup-desc">
            Stats roll when the armor drops — Bungie doesn’t share them without a Bungie.net
            sign-in.
          </p>
        )}

        {/* Random-roll weapons: full perk pool table (Barrel / Magazine / Perks 1 / Perks 2) */}
        {item.perkColumns ? (
          <>
            {item.description && <p className="vendor-popup-desc">{item.description}</p>}
            <div className="vendor-popup-cols">
              {item.perkColumns.map((c, i) => (
                <div key={`${c.label}-${i}`} className="vendor-popup-col">
                  <p className="vendor-popup-col-head">{c.label}</p>
                  {c.options.map((o) => (
                    <p key={o} className="vendor-popup-col-opt">
                      {o}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {item.perks?.length > 0 && (
              <div className="vendor-popup-perks">
                {item.perks.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="vendor-popup-perk" title={p.description}>
                    {p.icon && <img className="vendor-popup-perk-icon" src={p.icon} alt="" />}
                    <span className="vendor-popup-perk-name">{p.name}</span>
                    {p.type && <span className="vendor-popup-perk-type">{p.type}</span>}
                  </div>
                ))}
              </div>
            )}
            {!item.perks?.length && item.description && (
              <p className="vendor-popup-desc">{item.description}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
