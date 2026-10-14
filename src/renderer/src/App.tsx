import { useState, useEffect, useCallback, useRef } from 'react'
import TopNav from './components/TopNav'
import Login from './pages/Login'
import Library from './pages/Library'
import D1Raids from './pages/D1Raids'
import Activity from './pages/Activity'
import LiveActivity from './pages/LiveActivity'
import Inventory from './pages/Inventory'
import Weapons from './pages/Weapons'
import Vendors from './pages/Vendors'
import Following from './pages/Following'
import Bingo from './pages/Bingo'
import Roulette from './pages/Roulette'
import Settings from './pages/Settings'
import PgcrDetail from './pages/PgcrDetail'
import Notifications from './components/Notifications'
import ErrorBoundary from './components/ErrorBoundary'
import { loadWallpaper } from './utils/theme'
import './styles/app.css'

// Pages available in Destiny 1 mode (everything else is D2-only).
const D1_PAGES = new Set([
  'library',
  'strikes',
  'activity',
  'live',
  'inventory',
  'vendors',
  'settings',
  'pgcr'
])

function loadGamePref() {
  try {
    return localStorage.getItem('ngu-game') === 'd1' ? 'd1' : 'd2'
  } catch {
    return 'd2'
  }
}

export default function App() {
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [page, setPage] = useState('library')
  const [wallpaper, setWallpaper] = useState(loadWallpaper())

  // The wallpaper is a real element (see render) so it can't be hidden by an
  // opaque ancestor; Settings toggles it and fires this event.
  useEffect(() => {
    const onChange = (e) => setWallpaper(!!(e as CustomEvent).detail)
    window.addEventListener('wallpaper-change', onChange)
    return () => window.removeEventListener('wallpaper-change', onChange)
  }, [])

  // Auto-update: show a banner once a new version has downloaded in the background.
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  useEffect(() => {
    const off = window.api?.onUpdateDownloaded?.((info) => setUpdateVersion(info?.version || ''))
    return () => off?.()
  }, [])

  // Real activity data loaded from the Bungie API after login.
  const [data, setData] = useState(null)
  const [activitiesState, setActivitiesState] = useState('idle') // idle | loading | done | error
  const [activitiesError, setActivitiesError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState(null)
  // Guardian search for Recent Runs (lifted so a PGCR player click can drive it).
  const [runPlayerQuery, setRunPlayerQuery] = useState('')

  // Followed-user new-clear notifications. Baseline = app launch time; only clears that
  // happen after launch are shown. "Clear" advances the baseline to now.
  const [notifItems, setNotifItems] = useState([])
  const [notifCount, setNotifCount] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifSince, setNotifSince] = useState(() => new Date().toISOString())

  // Destiny 1 / Destiny 2 mode. `games` says which the account has (drives the toggle).
  const [game, setGame] = useState<'d1' | 'd2'>(loadGamePref)
  const [games, setGames] = useState<any>({ d1: false, d2: true })
  const [d1Data, setD1Data] = useState(null)
  const [d1State, setD1State] = useState('idle') // idle | loading | done | error
  const [d1Error, setD1Error] = useState('')

  const activities = data?.activities || []

  // Poll followed users for new clears since the baseline (on login + every few minutes).
  useEffect(() => {
    if (!user || !window.api?.followingNewClears) return
    let cancelled = false
    async function check() {
      try {
        const res = await window.api.followingNewClears(notifSince)
        if (!cancelled && res?.ok) {
          setNotifItems(res.items)
          setNotifCount(res.count)
        }
      } catch {
        /* ignore */
      }
    }
    check()
    const id = setInterval(check, 600000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user, notifSince])

  function toggleNotifs() {
    setShowNotifs((v) => !v)
  }

  function clearNotifs() {
    setNotifSince(new Date().toISOString())
    setNotifItems([])
    setNotifCount(0)
  }

  // Auto-restore a saved session on launch so the signed-in account persists.
  useEffect(() => {
    let cancelled = false
    if (!window.api?.getSession) {
      setRestoring(false)
      return
    }
    window.api
      .getSession()
      .then((session) => {
        if (cancelled) return
        if (session?.displayName) {
          setUser({ name: session.displayName, session })
        }
      })
      .finally(() => !cancelled && setRestoring(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Raid + dungeon clears completed today (one number). Recomputed live in the main
  // process so it reflects activities as they're finished.
  const [todayClears, setTodayClears] = useState<number | null>(null)
  const refreshTodayClears = useCallback(async () => {
    if (!window.api?.getTodayClears) return
    try {
      const r = await window.api.getTodayClears()
      if (r?.ok) setTodayClears(r.count)
    } catch {
      /* ignore */
    }
  }, [])

  // Load (or refresh) the activity data. On refresh we keep the current data visible.
  const loadData = useCallback(
    async (isRefresh = false) => {
      if (!window.api?.loadActivities) return
      if (isRefresh) setRefreshing(true)
      else setActivitiesState('loading')
      setActivitiesError('')
      try {
        const res = await window.api.loadActivities()
        if (res?.ok) {
          setData(res)
          setActivitiesState('done')
          refreshTodayClears()
        } else {
          setActivitiesError(res?.error || 'Failed to load activities.')
          setActivitiesState('error')
        }
      } catch (err) {
        setActivitiesError(err.message)
        setActivitiesState('error')
      } finally {
        setRefreshing(false)
      }
    },
    [refreshTodayClears]
  )

  // Bumped per load so a slow load for the previously selected D1 account is discarded
  // instead of overwriting the newly selected one.
  const d1LoadId = useRef(0)
  const loadD1 = useCallback(async () => {
    if (!window.api?.d1LoadActivities) return
    const loadId = ++d1LoadId.current
    setD1State((s) => (s === 'done' ? s : 'loading'))
    setD1Error('')
    try {
      const res = await window.api.d1LoadActivities()
      if (loadId !== d1LoadId.current) return
      if (res?.ok) {
        setD1Data(res)
        setD1State('done')
      } else {
        setD1Error(res?.error || 'Failed to load D1 raids.')
        setD1State('error')
      }
    } catch (err) {
      if (loadId !== d1LoadId.current) return
      setD1Error(err.message)
      setD1State('error')
    }
  }, [])

  async function changeD1Account(membershipId) {
    const res = await window.api?.d1SelectAccount?.(membershipId)
    if (!res?.ok) return
    d1LoadId.current++
    setGames(await window.api.getGameAccounts())
    setD1Data(null)
    setD1State('idle')
    if (page === 'pgcr') setPage('activity')
  }

  // Detect which games the account has, and fall back if the saved mode isn't available.
  useEffect(() => {
    if (!user || !window.api?.getGameAccounts) return
    let cancelled = false
    window.api
      .getGameAccounts()
      .then((g) => {
        if (cancelled || !g) return
        setGames(g)
        setGame((cur) => (cur === 'd1' && !g.d1 ? 'd2' : cur === 'd2' && !g.d2 && g.d1 ? 'd1' : cur))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  function changeGame(next) {
    if (next === game || !games[next]) return
    setGame(next)
    try {
      localStorage.setItem('ngu-game', next)
    } catch {
      /* per-viewer convenience only */
    }
    if (next === 'd1' && !D1_PAGES.has(page)) setPage('library')
    if (page === 'pgcr') setPage('activity')
    if (page === 'strikes') setPage('library')
  }

  // Load D1 raids the first time D1 mode is shown.
  useEffect(() => {
    if (user && game === 'd1' && d1State === 'idle') loadD1()
  }, [user, game, d1State, loadD1])

  // Poll today's clears on a slow interval as a fallback to the on-refresh update.
  useEffect(() => {
    if (!user) return
    refreshTodayClears()
    const id = setInterval(refreshTodayClears, 120000)
    return () => clearInterval(id)
  }, [user, refreshTodayClears])

  // Reload whenever the signed-in account changes (D2 data only when the account has D2).
  useEffect(() => {
    if (user && games.d2) loadData(false)
  }, [user, games.d2, loadData])

  // Where the PGCR back button returns to (recent runs by default; Following when a
  // followed player's badge opened the report).
  const [pgcrBack, setPgcrBack] = useState('activity')

  function openPgcr(instanceId, from = 'activity') {
    setSelectedInstance(instanceId)
    setPgcrBack(from)
    setPage('pgcr')
  }

  // Jump to Recent Runs filtered to a Guardian (clicked from a PGCR report).
  function searchPlayerRuns(name) {
    setRunPlayerQuery(name)
    setPage('activity')
  }

  async function handleLogout() {
    await window.api?.logout?.()
    setUser(null)
    setData(null)
    setActivitiesState('idle')
    setD1Data(null)
    setD1State('idle')
    setGames({ d1: false, d2: true })
    setPage('library')
  }

  if (restoring) {
    return (
      <div className="app-boot">
        <span className="spinner" /> Restoring session…
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={(profile) => setUser(profile)} />
  }

  return (
    <div className="app-shell">
      {wallpaper && <div className="wallpaper-backdrop" aria-hidden="true" />}
      {updateVersion !== null && (
        <div className="update-banner">
          <span className="update-banner-text">
            An update{updateVersion ? ` (v${updateVersion})` : ''} is ready.
          </span>
          <button className="update-banner-btn" onClick={() => window.api?.restartToUpdate?.()}>
            Restart &amp; update
          </button>
          <button
            className="update-banner-dismiss"
            onClick={() => setUpdateVersion(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <TopNav
        user={user}
        page={page}
        onNavigate={setPage}
        displayName={game === 'd1' && games.d1Name ? games.d1Name : user.name}
        platformLabel={game === 'd1' ? ({ 1: 'Xbox', 2: 'PlayStation' }[games.d1Platform] || null) : null}
        onRefresh={() => (game === 'd1' ? loadD1() : loadData(true))}
        refreshing={game === 'd1' ? d1State === 'loading' : refreshing || activitiesState === 'loading'}
        game={game}
        games={games}
        onGameChange={changeGame}
        onD1AccountChange={changeD1Account}
        todayClears={todayClears}
        notifCount={notifCount}
        onBell={toggleNotifs}
        onLogout={handleLogout}
      />
      {showNotifs && (
        <Notifications
          items={notifItems}
          onClear={clearNotifs}
          onClose={() => setShowNotifs(false)}
          onOpen={(instanceId) => {
            setShowNotifs(false)
            // Back from the PGCR returns to the page the user was on (keep the
            // existing back target if the report was opened from another PGCR).
            openPgcr(instanceId, page === 'pgcr' ? pgcrBack : page)
          }}
        />
      )}
      <main className="app-content">
        <ErrorBoundary resetKey={`${game}:${page}`}>
          {game === 'd1' && (page === 'library' || page === 'strikes') && (
            <D1Raids
              key={page}
              activityMode={page === 'strikes' ? 'strike' : 'raid'}
              activities={d1Data?.activities || []}
              state={d1State}
              error={d1Error}
              onOpenRun={openPgcr}
            />
          )}
          {game === 'd1' && page === 'activity' && (
            <Activity
              key="d1"
              game="d1"
              activities={d1Data?.activities || []}
              state={d1State}
              error={d1Error}
              onOpen={openPgcr}
              playerQuery={runPlayerQuery}
              onPlayerQuery={setRunPlayerQuery}
            />
          )}
          {game === 'd2' && page === 'library' && (
            <Library
              activities={activities}
              characterClasses={data?.characterClasses}
              state={activitiesState}
              error={activitiesError}
              onOpenRun={openPgcr}
            />
          )}
          {game === 'd2' && page === 'activity' && (
            <Activity
              key="d2"
              activities={activities}
              state={activitiesState}
              error={activitiesError}
              onOpen={openPgcr}
              playerQuery={runPlayerQuery}
              onPlayerQuery={setRunPlayerQuery}
            />
          )}
          {page === 'live' && <LiveActivity key={game} game={game} />}
          {page === 'inventory' && (
            <Inventory key={`${game}:${games.d1Id}`} game={game} authenticated={!!user?.session?.authenticated} />
          )}
          {page === 'weapons' && <Weapons />}
          {page === 'vendors' && (
            <Vendors key={game} game={game} authenticated={!!user?.session?.authenticated} />
          )}
          {page === 'following' && <Following onOpenRun={(id) => openPgcr(id, 'following')} />}
          {page === 'bingo' && <Bingo />}
          {page === 'roulette' && <Roulette />}
          {page === 'settings' && <Settings />}
          {page === 'pgcr' && (
            <PgcrDetail
              instanceId={selectedInstance}
              game={game}
              onBack={() => setPage(pgcrBack)}
              onSearchPlayer={searchPlayerRuns}
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
