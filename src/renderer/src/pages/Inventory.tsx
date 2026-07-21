import { useState, useEffect, useCallback, useRef } from 'react'
import { isWishlisted } from '../utils/wishlist'
import '../styles/inventory.css'

// DIM-style inventory: a Vault column plus one column per character. Drag a weapon/armour
// tile into another column to move it (character→character routes through the vault in the
// main process). Hover a tile for its live stats + perks. The search box filters every
// column by item name or perk name.
//
// The whole feature needs a Bungie-authenticated session (private profile components +
// the MoveEquipDestinyItems scope for transfers), so it's gated on `authenticated`.

const CLASS_LABEL = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock', 3: 'Any' }

// Each equipment slot is its own section, ordered weapons-first then armour top-to-bottom
// (the bucketOrder on each item already encodes this order).
const BUCKET_LABEL = {
  1498876634: 'Kinetic',
  2465295065: 'Energy',
  953998645: 'Power',
  3448274439: 'Helmet',
  3551918588: 'Gauntlets',
  14239492: 'Chest',
  20886954: 'Legs',
  1585787867: 'Class Item'
}

// Group a column's items into per-slot sections, ordered by slot. Used for character
// columns (single class, so slot grouping is enough).
function groupBySlot(items) {
  const byBucket = new Map()
  const groups = []
  for (const it of items) {
    let g = byBucket.get(it.bucket)
    if (!g) {
      g = { key: it.bucket, order: it.bucketOrder, label: BUCKET_LABEL[it.bucket] || 'Other', items: [] }
      byBucket.set(it.bucket, g)
      groups.push(g)
    }
    g.items.push(it)
  }
  return groups.sort((a, b) => a.order - b.order)
}

// Two-level grouping for the vault (every class + hundreds of items):
//   Weapons → slot (Kinetic / Energy / Power) → weapon type (Bow, Hand Cannon…)
//   Armour  → class (Titan / Hunter / Warlock) → armour slot (Helmet, Gauntlets…)
// Returns supergroups [{ label, subs: [{ label, items }] }]; weapon slots first (by slot
// order), then armour classes (Titan→Hunter→Warlock). A weapon type can therefore appear
// under more than one slot (e.g. a Bow under both Kinetic and Energy).
function groupVault(items) {
  const weapons = new Map() // bucket -> supergroup
  const armour = new Map() // classType -> supergroup
  const weaponSG = []
  const armourSG = []

  const sub = (sg, key, label, order) => {
    let s = sg.map.get(key)
    if (!s) {
      s = { key, label, order, items: [] }
      sg.map.set(key, s)
      sg.subs.push(s)
    }
    return s
  }

  for (const it of items) {
    if (it.category === 'weapon') {
      let sg = weapons.get(it.bucket)
      if (!sg) {
        sg = { key: `w${it.bucket}`, label: BUCKET_LABEL[it.bucket] || 'Weapons', order: it.bucketOrder, subs: [], map: new Map() }
        weapons.set(it.bucket, sg)
        weaponSG.push(sg)
      }
      const type = it.typeName || 'Weapon'
      sub(sg, type, type, 0).items.push(it)
    } else {
      let sg = armour.get(it.classType)
      if (!sg) {
        sg = { key: `a${it.classType}`, label: CLASS_LABEL[it.classType] || 'Other', order: it.classType, subs: [], map: new Map() }
        armour.set(it.classType, sg)
        armourSG.push(sg)
      }
      sub(sg, it.bucket, BUCKET_LABEL[it.bucket] || 'Armour', it.bucketOrder).items.push(it)
    }
  }

  weaponSG.sort((a, b) => a.order - b.order)
  armourSG.sort((a, b) => a.order - b.order)
  for (const sg of weaponSG) sg.subs.sort((a, b) => a.label.localeCompare(b.label)) // weapon types A→Z
  for (const sg of armourSG) sg.subs.sort((a, b) => a.order - b.order) // armour slots helmet→class
  return [...weaponSG, ...armourSG]
}

function tierClass(tier) {
  return tier === 6 ? 'is-exotic' : tier === 5 ? 'is-legendary' : tier === 4 ? 'is-rare' : 'is-common'
}

export default function Inventory({ authenticated }) {
  const [data, setData] = useState(null) // { characters, columns }
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [dragItem, setDragItem] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [tip, setTip] = useState(null) // { item, x, y, side }
  const [focus, setFocus] = useState(null) // characterId to focus on (vault + that char only)
  const [wishlist, setWishlist] = useState([]) // for the 👍 overlay on matching weapons
  const toastTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    window.api
      ?.wishlistList?.()
      .then((r) => !cancelled && r?.ok && setWishlist(r.list))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const flash = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const load = useCallback(async (background = false) => {
    if (!window.api?.inventoryGet) return
    if (!background) setState('loading')
    try {
      const res = await window.api.inventoryGet()
      if (res?.ok) {
        setData({ characters: res.characters, columns: res.columns })
        setState('done')
      } else {
        setError(res?.error || 'Failed to load inventory.')
        setState('error')
      }
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }, [])

  useEffect(() => {
    if (authenticated) load(false)
  }, [authenticated, load])

  // Move an item between columns, updating the UI immediately and reconciling with the
  // server afterwards (revert on failure).
  async function handleDrop(toCol) {
    const item = dragItem
    setDragItem(null)
    setDropTarget(null)
    if (!item || item.location === toCol || busy) return

    if (!item.transferable) {
      flash(item.equipped ? "Equipped items can't be moved — equip something else first." : "This item can't be transferred.")
      return
    }
    // Class-locked armour can only live on its own class or in the vault.
    if (item.category === 'armor' && item.classType !== 3 && toCol !== 'vault') {
      const target = data.characters.find((c) => c.id === toCol)
      if (target && target.classType !== item.classType) {
        flash(`${CLASS_LABEL[item.classType]} armour can't go on a ${target.class}.`)
        return
      }
    }

    const from = item.location
    const snapshot = data

    // If the destination character's slot is already full, evict its last (lowest-power)
    // item to the vault first to make room. Weapon/armour character slots hold 9
    // non-equipped items (a 10th, the equipped one, sits separately).
    const SLOT_CAP = 9
    let evict = null
    if (toCol !== 'vault') {
      const slotItems = (data.columns[toCol] || []).filter(
        (i) => i.bucket === item.bucket && !i.equipped
      )
      if (slotItems.length >= SLOT_CAP) {
        const evictable = slotItems.filter((i) => i.transferable)
        evict = evictable[evictable.length - 1] || null
        if (!evict) {
          flash('That slot is full and nothing in it can be moved out.')
          return
        }
      }
    }

    // Optimistic update: evict to the vault (if needed), then bring the new item in.
    setData((prev) => {
      const columns = { ...prev.columns }
      if (evict) {
        columns[toCol] = columns[toCol].filter((i) => i.instanceId !== evict.instanceId)
        columns.vault = [...columns.vault, { ...evict, location: 'vault', equipped: false }]
      }
      columns[from] = (columns[from] || []).filter((i) => i.instanceId !== item.instanceId)
      columns[toCol] = [...columns[toCol], { ...item, location: toCol, equipped: false }]
      return { ...prev, columns }
    })
    setBusy(true)
    try {
      if (evict) {
        const r = await window.api.inventoryTransfer({
          itemHash: evict.hash,
          itemId: evict.instanceId,
          from: toCol,
          to: 'vault'
        })
        if (!r?.ok) {
          setData(snapshot)
          flash(r?.error ? `Couldn't make room: ${r.error}` : "Couldn't make room in that slot.")
          load(true)
          return
        }
      }
      const res = await window.api.inventoryTransfer({
        itemHash: item.hash,
        itemId: item.instanceId,
        from,
        to: toCol
      })
      if (!res?.ok) {
        // A move can partially apply (character→vault→character), so pull true state
        // rather than trusting the pre-move snapshot.
        setData(snapshot)
        flash(res?.error || 'Transfer failed.')
        load(true)
      }
      // On success we keep the optimistic move as-is and deliberately do NOT refetch:
      // the item's data doesn't change on a transfer (only its location, already updated),
      // and Bungie's Profile endpoint lags a second or two after a move — refetching now
      // would briefly read the old location and bounce the item back. Use ⟳ Refresh for a
      // full resync when wanted.
    } catch (err) {
      setData(snapshot)
      flash(err.message || 'Transfer failed.')
      load(true)
    } finally {
      setBusy(false)
    }
  }

  function showTip(item, e) {
    const r = e.currentTarget.getBoundingClientRect()
    // Flip horizontally when there isn't room on the right; flip UP when the tile sits in
    // the bottom 40% of the screen so the tooltip doesn't run off the bottom edge.
    const flipX = r.right + 360 > window.innerWidth
    const flipY = r.top > window.innerHeight * 0.50
    setTip({
      item,
      x: flipX ? r.left - 8 : r.right + 8,
      y: flipY ? r.bottom : r.top,
      flipX,
      flipY
    })
  }

  if (!authenticated) {
    return (
      <div className="inv-gate">
        <div className="inv-gate-icon">🔐</div>
        <p className="inv-gate-title">Inventory needs a Bungie sign-in</p>
        <p className="inv-gate-sub">
          Sign out and use “Sign in with Bungie” so the app can read your characters and move
          items. Name-only lookups can’t access your inventory.
        </p>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const filterCol = (items) => (q ? items.filter((i) => i.search.includes(q)) : items)

  const columnList = data
    ? [
        { id: 'vault', label: 'Vault', sub: 'Shared storage', emblem: null },
        ...data.characters.map((c) => ({
          id: c.id,
          label: c.class,
          sub: c.light != null ? `✦ ${c.light}` : '',
          emblem: c.emblem
        }))
      ]
    : []

  // Focus mode: show only the vault and the chosen character. Ignore a stale focus id
  // (e.g. after a reload) so it never leaves an empty board.
  const focusValid = focus && data && data.characters.some((c) => c.id === focus)
  const visibleColumns = focusValid
    ? columnList.filter((c) => c.id === 'vault' || c.id === focus)
    : columnList
  // Class of the focused character — used to also narrow the vault's armour to that class.
  const focusedClassType = focusValid ? data.characters.find((c) => c.id === focus)?.classType : null

  return (
    <div className="inv">
      <header className="inv-toolbar">
        <div className="inv-heading">
          <h2>Inventory</h2>
          <span className="inv-sub">Drag items between the vault and your Guardians</span>
        </div>
        <div className="inv-toolbar-right">
          <input
            className="inv-search"
            type="text"
            placeholder="Search name or perk…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="inv-refresh" onClick={() => load(false)} disabled={state === 'loading' || busy}>
            {state === 'loading' ? 'Loading…' : '⟳ Refresh'}
          </button>
        </div>
      </header>

      {state === 'loading' && !data && (
        <div className="inv-status">
          <span className="spinner" /> Reading your vault and characters…
          <div className="inv-status-note">First run downloads the item database — this can take a moment.</div>
        </div>
      )}
      {state === 'error' && <div className="inv-status is-error">Couldn’t load inventory: {error}</div>}

      {data && (
        <div className={`inv-board ${busy ? 'is-busy' : ''}`}>
          {visibleColumns.map((col) => {
            const items = filterCol(data.columns[col.id] || []).map((i) =>
              wishlist.length && isWishlisted(i, wishlist) ? { ...i, wished: true } : i
            )
            const isVault = col.id === 'vault'
            const renderSection = (s, mode = 'grid') => (
              <ItemSection
                key={s.key}
                title={s.label}
                items={s.items}
                mode={mode}
                onDragStart={setDragItem}
                onDragEnd={() => {
                  setDragItem(null)
                  setDropTarget(null)
                }}
                onTip={showTip}
                onTipEnd={() => setTip(null)}
              />
            )
            return (
              <section
                key={col.id}
                className={`inv-col ${isVault ? 'is-vault-col' : ''} ${
                  dropTarget === col.id ? 'is-drop' : ''
                } ${dragItem && dragItem.location !== col.id ? 'is-droppable' : ''}`}
                onDragOver={(e) => {
                  if (dragItem) {
                    e.preventDefault()
                    if (dropTarget !== col.id) setDropTarget(col.id)
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                }}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="inv-col-head">
                  {col.emblem ? (
                    <img className="inv-col-emblem" src={col.emblem} alt="" />
                  ) : (
                    <span className="inv-col-emblem is-vault">▣</span>
                  )}
                  <div className="inv-col-meta">
                    <span className="inv-col-label">{col.label}</span>
                    <span className="inv-col-sub">{col.sub}</span>
                  </div>
                  <span className="inv-col-count">{items.length}</span>
                  {!isVault &&
                    (focus === col.id ? (
                      <button
                        className="inv-focus-btn is-on"
                        onClick={() => setFocus(null)}
                        title="Show all characters"
                      >
                        Show all
                      </button>
                    ) : (
                      <button
                        className="inv-focus-btn"
                        onClick={() => setFocus(col.id)}
                        title="Focus Character — show only the vault and this Guardian"
                      >
                        Focus
                      </button>
                    ))}
                </div>

                {isVault
                  ? groupVault(items)
                      // In focus mode, keep all weapon slots but only the focused class's
                      // armour (armour supergroups are keyed "a{classType}").
                      .filter(
                        (sg) =>
                          focusedClassType == null ||
                          sg.key[0] !== 'a' ||
                          sg.key === `a${focusedClassType}`
                      )
                      .map((sg) => (
                        <div key={sg.key} className="inv-supergroup">
                          <div className="inv-supergroup-title">{sg.label}</div>
                          {sg.subs.map((s) => renderSection(s))}
                        </div>
                      ))
                  : groupBySlot(items).map((g) =>
                      renderSection(g, focus === col.id ? 'focus' : 'inline')
                    )}
                {items.length === 0 && <div className="inv-empty">{q ? 'No matches' : 'Nothing here'}</div>}
              </section>
            )
          })}
        </div>
      )}

      {tip && <Tooltip tip={tip} />}
      {toast && <div className="inv-toast">{toast}</div>}
    </div>
  )
}

function Tile({ item, onDragStart, onDragEnd, onTip, onTipEnd }) {
  return (
    <div
      className={`inv-tile ${tierClass(item.tier)} ${item.transferable ? '' : 'is-locked'} ${
        item.equipped ? 'is-equipped' : ''
      }`}
      draggable={item.transferable}
      onDragStart={() => onDragStart(item)}
      onDragEnd={onDragEnd}
      onMouseEnter={(e) => onTip(item, e)}
      onMouseLeave={onTipEnd}
    >
      {item.icon && <img className="inv-tile-icon" src={item.icon} alt="" draggable={false} />}
      {item.watermark && <img className="inv-tile-watermark" src={item.watermark} alt="" draggable={false} />}
      {item.damageIcon && <img className="inv-tile-dmg" src={item.damageIcon} alt="" draggable={false} />}
      {item.power != null && <span className="inv-tile-power">{item.power}</span>}
      {item.equipped && <span className="inv-tile-equipped" title="Equipped">✓</span>}
      {item.wished && (
        <span className="inv-tile-wish" title="Matches a wishlisted roll">
          👍
        </span>
      )}
    </div>
  )
}

// A slot/type section, rendered in one of three layouts:
//   'grid'   — vault: label above, all items in the grid.
//   'inline' — character column: "[Kinetic] [equipped] [grid]" on one row.
//   'focus'  — focused character (more room): label on its own line, then a large equipped
//              icon beside the grid.
function ItemSection({ title, items, mode = 'grid', onDragStart, onDragEnd, onTip, onTipEnd }) {
  if (items.length === 0) return null
  const inline = mode === 'inline' || mode === 'focus'
  const equipped = inline ? items.filter((i) => i.equipped) : []
  const rest = inline ? items.filter((i) => !i.equipped) : items
  const tile = (item, idx) => (
    <Tile
      key={item.instanceId || `${item.hash}-${idx}`}
      item={item}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTip={onTip}
      onTipEnd={onTipEnd}
    />
  )
  const titleEl = (
    <span className="inv-section-title-text">
      {title} <span className="inv-section-count">{items.length}</span>
    </span>
  )
  const lead = equipped.length > 0 ? <span className="inv-section-lead">{equipped.map(tile)}</span> : null
  const grid = rest.length > 0 ? <div className="inv-grid">{rest.map(tile)}</div> : null

  if (inline) {
    // Label on its own line, above the equipped icon + grid of the rest.
    return (
      <div className={`inv-section ${mode === 'focus' ? 'inv-section-focus' : 'inv-section-inline'}`}>
        <div className="inv-section-title">{titleEl}</div>
        <div className="inv-section-row">
          {lead}
          {grid}
        </div>
      </div>
    )
  }
  return (
    <div className="inv-section">
      <div className="inv-section-title">{titleEl}</div>
      {grid}
    </div>
  )
}

function Tooltip({ tip }) {
  const { item } = tip
  // translateX(-100%) anchors the tooltip's right edge to the tile when flipped left;
  // translateY(-100%) anchors its bottom edge to the tile when flipped up.
  const style = {
    left: tip.x,
    top: tip.y,
    transform: `translate(${tip.flipX ? '-100%' : '0'}, ${tip.flipY ? '-100%' : '0'})`
  }
  return (
    <div className="inv-tooltip" style={style as any}>
      <div className={`inv-tt-head ${tierClass(item.tier)}`}>
        <span className="inv-tt-name">{item.name}</span>
        <span className="inv-tt-type">
          {item.tierName} {item.category === 'weapon' ? 'Weapon' : 'Armour'}
        </span>
      </div>
      <div className="inv-tt-line">
        {item.power != null && <span className="inv-tt-power">✦ {item.power}</span>}
        {item.damage && (
          <span className="inv-tt-dmg">
            {item.damageIcon && <img src={item.damageIcon} alt="" />}
            {item.damage}
          </span>
        )}
        {item.classType !== 3 && item.category === 'armor' && (
          <span className="inv-tt-class">{CLASS_LABEL[item.classType]}</span>
        )}
      </div>
      {item.stats.length > 0 && (
        <div className="inv-tt-stats">
          {item.stats.slice(0, 8).map((s, i) => (
            <div key={i} className="inv-tt-stat">
              <span className="inv-tt-stat-name">{s.name}</span>
              <span className="inv-tt-stat-val">{s.value}</span>
            </div>
          ))}
        </div>
      )}
      {item.perks.length > 0 && (
        <div className="inv-tt-perks">
          {item.perks.map((p, i) => (
            <div key={i} className={`inv-tt-perk ${p.enabled ? '' : 'is-off'}`}>
              {p.icon && <img src={p.icon} alt="" />}
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      )}
      {!item.transferable && (
        <div className="inv-tt-note">{item.equipped ? 'Equipped — equip another to move' : 'Not transferable'}</div>
      )}
    </div>
  )
}
