import { useState, useEffect, useCallback } from 'react'
import TopNav from './components/TopNav'
import Login from './pages/Login'
import Library from './pages/Library'
import Activity from './pages/Activity'
import LiveActivity from './pages/LiveActivity'
import Following from './pages/Following'
import Bingo from './pages/Bingo'
import Settings from './pages/Settings'
import PgcrDetail from './pages/PgcrDetail'
import Notifications from './components/Notifications'
import ErrorBoundary from './components/ErrorBoundary'
import { loadWallpaper } from './utils/theme'
import './styles/app.css'

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

  // Poll today's clears on a slow interval as a fallback to the on-refresh update.
  useEffect(() => {
    if (!user) return
    refreshTodayClears()
    const id = setInterval(refreshTodayClears, 120000)
    return () => clearInterval(id)
  }, [user, refreshTodayClears])

  // Reload whenever the signed-in account changes.
  useEffect(() => {
    if (user) loadData(false)
  }, [user, loadData])

  function openPgcr(instanceId) {
    setSelectedInstance(instanceId)
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
        onRefresh={() => loadData(true)}
        refreshing={refreshing || activitiesState === 'loading'}
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
        />
      )}
      <main className="app-content">
        <ErrorBoundary resetKey={page}>
          {page === 'library' && (
            <Library
              activities={activities}
              totals={data?.totals}
              characterClasses={data?.characterClasses}
              state={activitiesState}
              error={activitiesError}
            />
          )}
          {page === 'activity' && (
            <Activity
              activities={activities}
              state={activitiesState}
              error={activitiesError}
              onOpen={openPgcr}
              playerQuery={runPlayerQuery}
              onPlayerQuery={setRunPlayerQuery}
            />
          )}
          {page === 'live' && <LiveActivity />}
          {page === 'following' && <Following />}
          {page === 'bingo' && <Bingo />}
          {page === 'settings' && <Settings />}
          {page === 'pgcr' && (
            <PgcrDetail
              instanceId={selectedInstance}
              onBack={() => setPage('activity')}
              onSearchPlayer={searchPlayerRuns}
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
