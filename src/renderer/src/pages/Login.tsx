import { useState, useEffect } from 'react'
import WindowControls from '../components/WindowControls'
import '../styles/login.css'

// Accept either a bare name  (Guardian)  or a full Bungie name  (Guardian#1234).
// Name part is 3–27 chars with no '#'; the #code is optional.
const BUNGIE_NAME = /^[^#]{3,27}(#\d{1,6})?$/

export default function Login({ onLogin }) {
  const [bungieName, setBungieName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [oauthConfigured, setOauthConfigured] = useState(false)

  // Whether Bungie sign-in is available (.env configured). If not, we hide the button
  // and fall back to name lookup only.
  useEffect(() => {
    let cancelled = false
    window.api
      ?.getAuthStatus?.()
      .then((s) => !cancelled && setOauthConfigured(!!s?.configured))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function handleBungieLogin() {
    if (!window.api?.startBungieLogin) {
      setError('Sign-in bridge unavailable — run the app with "npm run dev".')
      return
    }
    setError('')
    setAuthLoading(true)
    try {
      const result = await window.api.startBungieLogin()
      if (result?.cancelled) return
      if (!result?.ok) {
        setError(result?.error || 'Bungie sign-in failed. Please try again.')
        return
      }
      onLogin({ name: result.session.displayName, session: result.session })
    } catch (err) {
      setError(`Something went wrong: ${err.message}`)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const value = bungieName.trim()

    if (!BUNGIE_NAME.test(value)) {
      setError('Enter a Guardian name, e.g. Guardian or Guardian#1234')
      return
    }

    if (!window.api?.login) {
      setError('Login bridge unavailable — run the app with "npm run dev".')
      return
    }

    setError('')
    setLoading(true)
    try {
      const result = await window.api.login(value)
      if (!result?.ok) {
        setError(result?.error || 'Login failed. Please try again.')
        return
      }
      onLogin({ name: result.session.displayName || value, session: result.session })
    } catch (err) {
      setError(`Something went wrong: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login">
      <div className="login-titlebar">
        <WindowControls />
      </div>

      <div className="login-card">
        <div className="login-header">
          <h1 className="login-brand">
            Number Go Up
          </h1>
          <p className="login-subtitle">Sign in to view your Destiny 2 report</p>
        </div>

        {oauthConfigured && (
          <div className="login-oauth">
            <button
              type="button"
              className="login-bungie"
              onClick={handleBungieLogin}
              disabled={authLoading || loading}
            >
              {authLoading ? 'Opening Bungie…' : 'Sign in with Bungie'}
            </button>
            <p className="login-oauth-hint">
              Unlocks live fireteam and private-profile data.
            </p>
            <div className="login-divider">
              <span>or look up by name</span>
            </div>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Bungie name</span>
            <input
              type="text"
              value={bungieName}
              placeholder="Guardian or Guardian#1234"
              disabled={loading || authLoading}
              onChange={(e) => {
                setBungieName(e.target.value)
                if (error) setError('')
              }}
              autoFocus
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-submit" disabled={loading || authLoading}>
            {loading ? 'Checking…' : 'View my report'}
          </button>

          <p className="login-hint">
            We look up your Guardian.
          </p>
        </form>
      </div>
    </div>
  )
}
