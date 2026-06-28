import { useState } from 'react'
import WindowControls from '../components/WindowControls'
import '../styles/login.css'

// Accept either a bare name  (Guardian)  or a full Bungie name  (Guardian#1234).
// Name part is 3–27 chars with no '#'; the #code is optional.
const BUNGIE_NAME = /^[^#]{3,27}(#\d{1,6})?$/

export default function Login({ onLogin }) {
  const [bungieName, setBungieName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
          <p className="login-subtitle">Sign in with your Destiny 2 Bungie name</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Bungie name</span>
            <input
              type="text"
              value={bungieName}
              placeholder="Guardian or Guardian#1234"
              disabled={loading}
              onChange={(e) => {
                setBungieName(e.target.value)
                if (error) setError('')
              }}
              autoFocus
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-submit" disabled={loading}>
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
