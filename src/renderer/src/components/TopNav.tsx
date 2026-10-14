import { useState, useEffect, useRef } from 'react'
import WindowControls from './WindowControls'

const TABS = [
  { id: 'library', label: 'Activities' },
  { id: 'activity', label: 'Recent Runs' },
  { id: 'live', label: 'Live Activity' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'following', label: 'Following' },
  // "RaD Fun" is a dropdown — its children are real pages.
  {
    id: 'radfun',
    label: 'RaD Fun',
    children: [
      { id: 'bingo', label: 'Bingo' },
      { id: 'roulette', label: 'Roulette' }
    ]
  },
  { id: 'settings', label: 'Settings' }
]

// Destiny 1 mode: raids, strikes, run history, live activity, inventory, vendors, settings.
const D1_TABS = [
  { id: 'library', label: 'Raids' },
  { id: 'strikes', label: 'Strikes' },
  { id: 'activity', label: 'Recent Runs' },
  { id: 'live', label: 'Live Activity' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'settings', label: 'Settings' }
]

const D1_PLATFORM_LABEL = { 1: 'Xbox', 2: 'PlayStation' }

export default function TopNav({
  user,
  page,
  onNavigate,
  onRefresh,
  refreshing,
  todayClears = null,
  notifCount = 0,
  onBell,
  onLogout,
  game = 'd2',
  games = { d1: false, d2: true },
  onGameChange,
  onD1AccountChange,
  displayName = null,
  platformLabel = null
}: any) {
  const name = displayName || user.name
  const isD1 = game === 'd1'
  const tabs: any[] = isD1 ? D1_TABS : TABS
  // Hover-driven dropdown with a short close delay, so the menu survives the cursor
  // travelling from the tab down to the menu items (pure CSS :hover dropped it the
  // instant the pointer left the button).
  const [dropOpen, setDropOpen] = useState(false)
  const closeTimer = useRef(null)
  const openDrop = () => {
    clearTimeout(closeTimer.current)
    setDropOpen(true)
  }
  const closeDrop = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setDropOpen(false), 250)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  return (
    <header className="topnav">
      <div className="topnav-brand">
        <span className="topnav-logo">◆</span>
        <span className="topnav-title">number go up</span>
        <div className="game-toggle" role="group" aria-label="Destiny version">
          {[
            { id: 'd1', label: 'D1', missing: 'No Destiny 1 account linked' },
            { id: 'd2', label: 'D2', missing: 'No Destiny 2 account linked' }
          ].map((g) => (
            <button
              key={g.id}
              className={`game-toggle-btn ${game === g.id ? 'is-active' : ''}`}
              disabled={!games[g.id]}
              onClick={() => onGameChange?.(g.id)}
              title={games[g.id] ? `Switch to Destiny ${g.id.slice(1)}` : g.missing}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="topnav-tabs">
        {tabs.map((tab) =>
          tab.children ? (
            <div
              key={tab.id}
              className="topnav-drop"
              onMouseEnter={openDrop}
              onMouseLeave={closeDrop}
            >
              <button
                className={`topnav-tab ${
                  tab.children.some((c) => c.id === page) ? 'is-active' : ''
                }`}
                // Clicking the tab itself jumps straight to the first entry.
                onClick={() => onNavigate(tab.children[0].id)}
              >
                {tab.label} <span className="topnav-drop-caret">▾</span>
              </button>
              <div className={`topnav-drop-menu ${dropOpen ? 'is-open' : ''}`}>
                {tab.children.map((c) => (
                  <button
                    key={c.id}
                    className={`topnav-drop-item ${page === c.id ? 'is-active' : ''}`}
                    onClick={() => {
                      onNavigate(c.id)
                      setDropOpen(false)
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              key={tab.id}
              className={`topnav-tab ${page === tab.id ? 'is-active' : ''}`}
              onClick={() => onNavigate(tab.id)}
            >
              {tab.label}
            </button>
          )
        )}
      </nav>

      <div className="topnav-user">
        {!isD1 && (
        <span className="topnav-today" title="Full raid & dungeon clears completed today (checkpoints excluded)">
          <span className="topnav-today-icon" aria-hidden="true">
            ⚔
          </span>
          <span className="topnav-today-value">{todayClears ?? '—'}</span>
          <span className="topnav-today-label">today</span>
        </span>
        )}
        {!isD1 && (
          <button className="topnav-bell" onClick={onBell} title="New clears from people you follow">
            🔔
            {notifCount > 0 && <span className="topnav-bell-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
          </button>
        )}
        <button
          className="topnav-refresh"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh stats"
          aria-label="Refresh stats"
        >
          ⟳
        </button>
        <div className="topnav-avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </div>
        <div className="topnav-user-meta">
          <span className="topnav-user-name">{name}</span>
          {isD1 && games.d1Accounts?.length > 1 ? (
            <select
              className="topnav-account-select"
              value={games.d1Id || ''}
              onChange={(e) => onD1AccountChange?.(e.target.value)}
              aria-label="Destiny 1 account"
              title="Switch Destiny 1 account"
            >
              {games.d1Accounts.map((account) => (
                <option key={account.membershipId} value={account.membershipId}>
                  {D1_PLATFORM_LABEL[account.membershipType] || 'Destiny 1'}
                  {account.displayName ? ` · ${account.displayName}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="topnav-user-status">
              {refreshing ? 'Refreshing…' : platformLabel ? `Destiny 1 · ${platformLabel}` : 'Online'}
            </span>
          )}
        </div>
        <button className="topnav-logout" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <WindowControls />
    </header>
  )
}
