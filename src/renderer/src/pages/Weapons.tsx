import { useState, useEffect } from 'react'
import { weaponMatchesEntry } from '../utils/wishlist'
import '../styles/weapons.css'

// Wishlist tab: browse every random-roll weapon, open one to pick the perks you want per
// column (multi-select), and save it as a god-roll. The "My wishlist" view lists saved
// rolls to edit or remove. Matching inventory weapons get a 👍 over on the Inventory tab.

// The catalog is large; cache it at module level so switching tabs doesn't refetch.
let catalogCache = null

const ELEMENTS = ['Kinetic', 'Arc', 'Solar', 'Void', 'Stasis', 'Strand']
const SLOTS = ['Kinetic', 'Energy', 'Power']

function tierClass(tier) {
  return tier === 6 ? 'is-exotic' : tier === 5 ? 'is-legendary' : 'is-rare'
}

// Kill / Crucible / memento "tracker" columns live in the same perk socket category but
// aren't real perks — drop them from the picker. A column is a tracker if its label or all
// of its plugs mention "tracker".
function isTrackerColumn(col) {
  return /tracker/i.test(col.label) || col.plugs.every((p) => /tracker/i.test(p.name))
}
function perkColumns(entry) {
  return entry.columns.filter((c) => !isTrackerColumn(c))
}

// Collapse base + enhanced copies of a perk (same name, different hash) to one entry.
function dedupByName(plugs) {
  const seen = new Set()
  return plugs.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
}

// Resolve a list of plug hashes to unique-by-name plugs (for rendering a saved group).
function uniquePlugs(entry, hashes) {
  const seen = new Set()
  const out = []
  for (const h of hashes) {
    const p = findPlug(entry, h)
    const name = p?.name ?? String(h)
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ hash: h, name: p?.name, icon: p?.icon })
  }
  return out
}

// Find a plug's { name, icon } within a catalog entry's columns (for rendering saved perks).
function findPlug(entry, hash) {
  if (!entry) return null
  for (const col of entry.columns) {
    const p = col.plugs.find((pl) => pl.hash === hash)
    if (p) return p
  }
  return null
}

export default function Weapons() {
  const [catalog, setCatalog] = useState(catalogCache || [])
  const [wishlist, setWishlist] = useState([])
  const [state, setState] = useState(catalogCache ? 'done' : 'loading')
  const [error, setError] = useState('')
  const [view, setView] = useState('browse') // browse | wishlist
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { entry, selected: Set<number> }
  const [showFilter, setShowFilter] = useState(false)
  const [filters, setFilters] = useState<{
    elements: Set<string>
    types: Set<string>
    slots: Set<string>
  }>({ elements: new Set(), types: new Set(), slots: new Set() })
  // "Historic weapons" setting (persisted): off = hide weapons that have no origin trait
  // (i.e. pre-origin-trait weapons), but always keep exotics. On = show everything.
  const [historic, setHistoric] = useState(() => localStorage.getItem('weapons-historic') === '1')
  useEffect(() => {
    localStorage.setItem('weapons-historic', historic ? '1' : '0')
  }, [historic])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const wl = await window.api?.wishlistList?.()
        if (!cancelled && wl?.ok) setWishlist(wl.list)
        if (catalogCache) return
        setState('loading')
        const res = await window.api?.weaponCatalog?.()
        if (cancelled) return
        if (res?.ok) {
          catalogCache = res.weapons
          setCatalog(catalogCache)
          setState('done')
        } else {
          setError(res?.error || 'Failed to load the weapon catalog.')
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
  }, [])

  const wishedHashes = new Set(wishlist.map((e) => e.weaponHash))

  function openWeapon(entry) {
    if (!entry) return
    const existing = wishlist.find((e) => e.weaponHash === entry.hash)
    const selected = new Set(existing ? existing.groups.flat() : [])
    setModal({ entry, selected })
  }

  function togglePerk(hash) {
    setModal((m) => {
      const selected = new Set(m.selected)
      if (selected.has(hash)) selected.delete(hash)
      else selected.add(hash)
      return { ...m, selected }
    })
  }

  async function saveModal() {
    const { entry, selected } = modal
    // Per column: the hashes of every plug whose NAME matches a selected perk — so both the
    // base and enhanced versions are stored, and either will match an inventory weapon.
    const groups = perkColumns(entry)
      .map((col) => {
        const names = new Set(col.plugs.filter((p) => selected.has(p.hash)).map((p) => p.name))
        return col.plugs.filter((p) => names.has(p.name)).map((p) => p.hash)
      })
      .filter((g) => g.length > 0)
    const res = await window.api.wishlistSave({
      weaponHash: entry.hash,
      name: entry.name,
      icon: entry.icon,
      groups
    })
    if (res?.ok) {
      setWishlist(res.list)
      setModal(null)
    }
  }

  async function removeEntry(weaponHash) {
    const res = await window.api.wishlistRemove(weaponHash)
    if (res?.ok) setWishlist(res.list)
  }

  function toggleFilter(cat: 'elements' | 'types' | 'slots', value: string) {
    setFilters((f) => {
      const set = new Set(f[cat])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...f, [cat]: set }
    })
  }
  function clearFilters() {
    setFilters({ elements: new Set(), types: new Set(), slots: new Set() })
  }
  const activeCount = filters.elements.size + filters.types.size + filters.slots.size
  const weaponTypes = [...new Set(catalog.map((w) => w.typeName).filter(Boolean))].sort()

  const q = search.trim().toLowerCase()
  const filtered = catalog.filter((w) => {
    // Default: only currently-obtainable weapons (have a drop source), plus all exotics.
    // "Historic weapons" reveals the rest (no source = vaulted / unobtainable).
    if (!historic && w.tier !== 6 && !w.source) return false
    if (q && !(w.name.toLowerCase().includes(q) || (w.typeName || '').toLowerCase().includes(q)))
      return false
    if (filters.elements.size && !filters.elements.has(w.element)) return false
    if (filters.types.size && !filters.types.has(w.typeName)) return false
    if (filters.slots.size && !filters.slots.has(w.slot)) return false
    return true
  })

  return (
    <div className="wl">
      <header className="wl-toolbar">
        <div className="wl-tabs">
          <button className={`wl-tab ${view === 'browse' ? 'is-on' : ''}`} onClick={() => setView('browse')}>
            Browse weapons
          </button>
          <button className={`wl-tab ${view === 'wishlist' ? 'is-on' : ''}`} onClick={() => setView('wishlist')}>
            My wishlist{wishlist.length > 0 ? ` (${wishlist.length})` : ''}
          </button>
        </div>
        {view === 'browse' && (
          <div className="wl-controls">
            <input
              className="wl-search"
              type="text"
              placeholder="Search weapon name or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="wl-filter">
              <button
                className={`wl-filter-btn ${activeCount ? 'is-on' : ''}`}
                onClick={() => setShowFilter((v) => !v)}
              >
                Filter{activeCount ? ` (${activeCount})` : ''} ▾
              </button>
              {showFilter && (
                <>
                  <div className="wl-filter-backdrop" onClick={() => setShowFilter(false)} />
                  <div className="wl-filter-panel">
                    <label className="wl-historic">
                      <input
                        type="checkbox"
                        checked={historic}
                        onChange={() => setHistoric((v) => !v)}
                      />
                      <span>Historic weapons</span>
                    </label>
                    <div className="wl-historic-note">
                      Off: obtainable weapons (with a drop source) + exotics. On: include
                      weapons with no source (vaulted / unobtainable).
                    </div>
                    <FilterGroup title="Slot" values={SLOTS} sel={filters.slots} onToggle={(v) => toggleFilter('slots', v)} />
                    <FilterGroup title="Element" values={ELEMENTS} sel={filters.elements} onToggle={(v) => toggleFilter('elements', v)} />
                    <FilterGroup title="Weapon type" values={weaponTypes} sel={filters.types} onToggle={(v) => toggleFilter('types', v)} grid2 />
                    {activeCount > 0 && (
                      <button className="wl-filter-clear" onClick={clearFilters}>
                        Clear all
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {state === 'loading' && (
        <div className="wl-status">
          <span className="spinner" /> Building the weapon catalog…
          <div className="wl-status-note">First run downloads the item database — this can take a moment.</div>
        </div>
      )}
      {state === 'error' && <div className="wl-status is-error">Couldn’t load weapons: {error}</div>}

      {state === 'done' && view === 'browse' && (
        <div className="wl-list">
          {filtered.map((w) => (
            <button key={w.hash} className="wl-row" onClick={() => openWeapon(w)}>
              <span className={`wl-row-icon ${tierClass(w.tier)}`}>
                <img src={w.icon} alt="" />
                {w.watermark && <img className="wl-row-wm" src={w.watermark} alt="" />}
              </span>
              <span className="wl-row-meta">
                <span className="wl-row-name">{w.name}</span>
                <span className="wl-row-type">{w.typeName}</span>
              </span>
              {wishedHashes.has(w.hash) && <span className="wl-row-star" title="On your wishlist">★</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="wl-empty">No weapons match “{search}”.</div>}
        </div>
      )}

      {state === 'done' && view === 'wishlist' && (
        <div className="wl-saved">
          {wishlist.length === 0 ? (
            <div className="wl-empty">
              Nothing wishlisted yet. Open a weapon in Browse and pick the perks you want.
            </div>
          ) : (
            wishlist.map((e) => {
              const cat = catalog.find((w) => w.hash === e.weaponHash)
              return (
                <div key={e.weaponHash} className="wl-card">
                  <span className="wl-card-icon">
                    <img src={e.icon} alt="" />
                  </span>
                  <div className="wl-card-body">
                    <div className="wl-card-name">{e.name}</div>
                    <div className="wl-card-groups">
                      {e.groups.map((g, gi) => (
                        <div key={gi} className="wl-card-group">
                          {uniquePlugs(cat, g).map((p) =>
                            p.icon ? (
                              <img key={p.hash} className="wl-perk-icon" src={p.icon} alt="" title={p.name} />
                            ) : (
                              <span key={p.hash} className="wl-perk-missing" title="Perk unavailable">?</span>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="wl-card-actions">
                    <button className="wl-btn" onClick={() => openWeapon(cat)} disabled={!cat}>
                      Edit
                    </button>
                    <button className="wl-btn is-danger" onClick={() => removeEntry(e.weaponHash)}>
                      Remove
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {modal && (
        <PerkModal
          modal={modal}
          existing={wishedHashes.has(modal.entry.hash)}
          onToggle={togglePerk}
          onSave={saveModal}
          onRemove={() => {
            removeEntry(modal.entry.hash)
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function FilterGroup({ title, values, sel, onToggle, grid2 = false }) {
  if (!values.length) return null
  return (
    <div className="wl-fg">
      <div className="wl-fg-title">{title}</div>
      <div className={`wl-fg-items ${grid2 ? 'is-grid2' : ''}`}>
        {values.map((v) => (
          <label key={v} className="wl-check">
            <input type="checkbox" checked={sel.has(v)} onChange={() => onToggle(v)} />
            <span>{v}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function PerkModal({ modal, existing, onToggle, onSave, onRemove, onClose }) {
  const { entry, selected } = modal
  const matches = weaponMatchesEntry(
    [...selected],
    perkColumns(entry)
      .map((c) => c.plugs.filter((p) => selected.has(p.hash)).map((p) => p.hash))
      .filter((g) => g.length)
  )
  return (
    <>
      <div className="wl-modal-backdrop" onClick={onClose} />
      <div className="wl-modal" role="dialog">
        <div className={`wl-modal-head ${tierClass(entry.tier)}`}>
          <img className="wl-modal-icon" src={entry.icon} alt="" />
          <div className="wl-modal-title">
            <span className="wl-modal-name">{entry.name}</span>
            <span className="wl-modal-type">{entry.typeName}</span>
          </div>
          <button className="wl-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {entry.source && <div className="wl-modal-source">Source: {entry.source}</div>}

        <div className="wl-modal-cols">
          {perkColumns(entry).map((col, ci) => (
            <div key={ci} className="wl-col">
              <div className="wl-col-label">{col.label}</div>
              <div className="wl-col-perks">
                {dedupByName(col.plugs).map((p) => (
                  <button
                    key={p.hash}
                    className={`wl-perk ${selected.has(p.hash) ? 'is-on' : ''}`}
                    onClick={() => onToggle(p.hash)}
                    title={p.name}
                  >
                    {p.icon && <img src={p.icon} alt="" />}
                    <span className="wl-perk-name">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="wl-modal-foot">
          <span className="wl-modal-hint">
            Pick the perks you want in each column — multiple per column is fine.
          </span>
          <div className="wl-modal-btns">
            {existing && (
              <button className="wl-btn is-danger" onClick={onRemove}>
                Remove
              </button>
            )}
            <button className="wl-btn is-primary" onClick={onSave} disabled={!matches}>
              {existing ? 'Update wishlist' : 'Save to wishlist'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
