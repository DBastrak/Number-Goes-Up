import { useState, useEffect, useRef } from 'react'
import WindowControls from './WindowControls'

const TABS = [
  { id: 'library', label: 'Activities' },
  { id: 'activity', label: 'Recent Runs' },
  { id: 'live', label: 'Live Activity' },
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

export default function TopNav({
  user,
  page,
  onNavigate,
  onRefresh,
  refreshing,
  todayClears = null,
  notifCount = 0,
  onBell,
  onLogout
}) {
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
      </div>

      <nav className="topnav-tabs">
        {TABS.map((tab) =>
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
        <span className="topnav-today" title="Full raid & dungeon clears completed today (checkpoints excluded)">
          <span className="topnav-today-icon" aria-hidden="true">
            ⚔
          </span>
          <span className="topnav-today-value">{todayClears ?? '—'}</span>
          <span className="topnav-today-label">today</span>
        </span>
        <button className="topnav-bell" onClick={onBell} title="New clears from people you follow">
          🔔
          {notifCount > 0 && <span className="topnav-bell-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
        </button>
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
          {user.name.slice(0, 1)}
        </div>
        <div className="topnav-user-meta">
          <span className="topnav-user-name">{user.name}</span>
          <span className="topnav-user-status">{refreshing ? 'Refreshing…' : 'Online'}</span>
        </div>
        <button className="topnav-logout" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <WindowControls />
    </header>
  )
}
