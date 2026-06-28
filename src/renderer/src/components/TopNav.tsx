import WindowControls from './WindowControls'

const TABS = [
  { id: 'library', label: 'Activities' },
  { id: 'activity', label: 'Recent Runs' },
  { id: 'live', label: 'Live Activity' },
  { id: 'following', label: 'Following' },
  { id: 'bingo', label: 'Bingo' },
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
  return (
    <header className="topnav">
      <div className="topnav-brand">
        <span className="topnav-logo">◆</span>
        <span className="topnav-title">number go up</span>
      </div>

      <nav className="topnav-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`topnav-tab ${page === tab.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(tab.id)}
          >
            {tab.label}
          </button>
        ))}
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
