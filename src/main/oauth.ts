// Bungie OAuth (authorization-code flow) for the signed-in account.
//
// Why this exists: the API-key-only path can read public data, but a few components are
// private to the account that owns them — most importantly profileTransitoryData (1000),
// which carries the live fireteam. Signing in with the user's own Bungie account and
// sending an Authorization: Bearer token unlocks those for the logged-in Guardian.
//
// Flow (desktop variant): we open a BrowserWindow on Bungie's Authorize page. Bungie is
// configured with an https redirect URL that we never actually serve — instead we watch
// the OAuth window's navigation and, the moment it heads for that redirect, pull the
// ?code= out of the URL and cancel the navigation. The code is exchanged for tokens at
// the Token endpoint. Access tokens last ~1h; the refresh token (~90d) silently renews.
//
// Config comes from .env (same file as bungieAPI):
//   bungieClientId ....... OAuth client id from the Bungie app settings (required)
//   bungieClientSecret ... secret for a "Confidential" app (needed for refresh tokens)
//   bungieRedirectUri .... must match the app's registered redirect (default https://localhost/)
//
// Tokens are stored in userData/oauth.json, encrypted at rest via Electron safeStorage
// (DPAPI on Windows) when available.

import { BrowserWindow, safeStorage, app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, rmSync } from 'fs'
import { randomBytes } from 'crypto'
import { bungieGetAuth } from './client'

const AUTHORIZE_URL = 'https://www.bungie.net/en/OAuth/Authorize'
const TOKEN_URL = 'https://www.bungie.net/Platform/App/OAuth/Token/'
const BASE = 'https://www.bungie.net/Platform'

function config() {
  return {
    clientId: process.env.bungieClientId || '',
    clientSecret: process.env.bungieClientSecret || '',
    redirectUri: process.env.bungieRedirectUri || 'https://localhost/'
  }
}

export function isOAuthConfigured() {
  return !!config().clientId
}

// --- Token store (encrypted at rest) ---
type Tokens = {
  accessToken: string
  refreshToken: string | null
  accessExpiresAt: number // epoch ms (already includes a small safety margin)
  refreshExpiresAt: number | null
  membershipId: string // bungie.net membership id from the token response
}

let tokens: Tokens | null = null
let loaded = false

function tokenFile() {
  return join(app.getPath('userData'), 'oauth.json')
}

function persist(next: Tokens | null) {
  tokens = next
  loaded = true
  try {
    if (!next) {
      rmSync(tokenFile(), { force: true })
      return
    }
    const json = JSON.stringify(next)
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(
        tokenFile(),
        JSON.stringify({ v: 1, enc: safeStorage.encryptString(json).toString('base64') })
      )
    } else {
      // No OS keychain available — fall back to plaintext so the feature still works.
      writeFileSync(tokenFile(), JSON.stringify({ v: 1, plain: json }))
    }
  } catch (err) {
    console.error('[oauth] failed to save tokens:', err)
  }
}

function loadTokens(): Tokens | null {
  if (loaded) return tokens
  loaded = true
  try {
    const raw = JSON.parse(readFileSync(tokenFile(), 'utf8'))
    let json: string | null = null
    if (raw.enc && safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(Buffer.from(raw.enc, 'base64'))
    } else if (raw.plain) {
      json = raw.plain
    }
    if (json) tokens = JSON.parse(json)
  } catch {
    tokens = null
  }
  return tokens
}

export function hasAuth() {
  return !!loadTokens()
}

export function clearAuth() {
  persist(null)
}

// POST to the token endpoint (form-encoded). Confidential apps authenticate with HTTP
// Basic (client_id:client_secret); public apps send just the client_id in the body.
async function requestToken(params: Record<string, string>): Promise<Tokens> {
  const { clientId, clientSecret } = config()
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (clientSecret) {
    headers.Authorization =
      'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  }
  const body = new URLSearchParams({ ...params, client_id: clientId }).toString()

  const res = await fetch(TOKEN_URL, { method: 'POST', headers, body })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    const msg = data?.error_description || data?.error || `HTTP ${res.status}`
    throw new Error(`Bungie token request failed: ${msg}`)
  }

  const now = Date.now()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    // Expire 60s early so an in-flight request never races the real expiry.
    accessExpiresAt: now + (Number(data.expires_in) || 3600) * 1000 - 60_000,
    refreshExpiresAt: data.refresh_expires_in ? now + Number(data.refresh_expires_in) * 1000 : null,
    membershipId: data.membership_id || tokens?.membershipId || ''
  }
}

// A single in-flight refresh is shared by concurrent callers so we never fire two.
let refreshing: Promise<string | null> | null = null

// Return a valid access token, refreshing if the current one has expired. Returns null
// when there's no session or the refresh token is gone/expired (caller should re-login).
export async function getAccessToken(): Promise<string | null> {
  const t = loadTokens()
  if (!t) return null
  if (Date.now() < t.accessExpiresAt) return t.accessToken

  if (!t.refreshToken || (t.refreshExpiresAt && Date.now() > t.refreshExpiresAt)) {
    return null
  }
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const next = await requestToken({
          grant_type: 'refresh_token',
          refresh_token: t.refreshToken as string
        })
        if (!next.membershipId) next.membershipId = t.membershipId
        persist(next)
        return next.accessToken
      } catch (err) {
        console.error('[oauth] token refresh failed:', (err as Error).message)
        return null
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

// Pick the active Destiny membership, honouring cross-save (mirrors bungie.ts).
function pickPrimary(memberships, primaryId) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null
  if (primaryId) {
    const match = memberships.find((m) => m.membershipId === primaryId)
    if (match) return match
  }
  return (
    memberships.find(
      (m) => m.crossSaveOverride === 0 || m.crossSaveOverride === m.membershipType
    ) || memberships[0]
  )
}

// Build the app's session object (same shape lookupGuardian produces) from the
// authenticated user's memberships, so the rest of the app is unchanged — plus a
// `authenticated: true` flag.
async function buildSession(accessToken: string) {
  const { body } = await bungieGetAuth(
    `${BASE}/User/GetMembershipsForCurrentUser/`,
    accessToken
  )
  const resp = body?.Response
  const memberships = resp?.destinyMemberships || []
  const primary = pickPrimary(memberships, resp?.primaryMembershipId)
  if (!primary) {
    return { ok: false as const, error: 'Signed in, but this account has no Destiny characters.' }
  }
  const name =
    primary.bungieGlobalDisplayName ||
    resp?.bungieNetUser?.cachedBungieGlobalDisplayName ||
    resp?.bungieNetUser?.displayName ||
    'Guardian'
  const code = String(
    primary.bungieGlobalDisplayNameCode ??
      resp?.bungieNetUser?.cachedBungieGlobalDisplayNameCode ??
      ''
  ).padStart(4, '0')

  return {
    ok: true as const,
    session: {
      displayName: `${name}#${code}`,
      membershipId: primary.membershipId,
      membershipType: primary.membershipType,
      primaryMembershipId: resp?.primaryMembershipId || primary.membershipId,
      destinyMemberships: memberships,
      authenticated: true,
      savedAt: new Date().toISOString()
    }
  }
}

// Run the interactive OAuth login. Opens the Bungie sign-in window as a child of
// `parent`, exchanges the returned code for tokens, and resolves the app session.
export async function startOAuthLogin(parent?: BrowserWindow) {
  const { clientId, redirectUri } = config()
  if (!clientId) {
    return {
      ok: false,
      error:
        'Bungie sign-in is not configured. Add bungieClientId (and bungieClientSecret) to your .env file.'
    }
  }

  const state = randomBytes(16).toString('hex')
  const authUrl =
    `${AUTHORIZE_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code&state=${state}`

  let code: string
  try {
    code = await new Promise<string>((resolve, reject) => {
      const win = new BrowserWindow({
        width: 520,
        height: 760,
        parent,
        modal: !!parent,
        show: true,
        title: 'Sign in with Bungie',
        autoHideMenuBar: true,
        backgroundColor: '#1b2838',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
      })

      let settled = false
      const settle = (fn: (v?) => void, value?) => {
        if (settled) return
        settled = true
        try {
          win.close()
        } catch {
          /* already gone */
        }
        fn(value)
      }

      // Returns true once the URL is (or errors at) our redirect target.
      const handleRedirect = (url: string) => {
        if (!url.startsWith(redirectUri)) return false
        let u: URL
        try {
          u = new URL(url)
        } catch {
          return false
        }
        const err = u.searchParams.get('error')
        if (err) {
          settle(reject, new Error(`Bungie denied authorization (${err}).`))
          return true
        }
        if (u.searchParams.get('state') !== state) {
          settle(reject, new Error('OAuth state mismatch — please try again.'))
          return true
        }
        const returnedCode = u.searchParams.get('code')
        if (returnedCode) {
          settle(resolve, returnedCode)
          return true
        }
        return false
      }

      win.webContents.on('will-redirect', (e, url) => {
        if (handleRedirect(url)) e.preventDefault()
      })
      win.webContents.on('will-navigate', (e, url) => {
        if (handleRedirect(url)) e.preventDefault()
      })
      win.on('closed', () => {
        if (!settled) {
          settled = true
          reject(new Error('cancelled'))
        }
      })

      win.loadURL(authUrl)
    })
  } catch (err) {
    if ((err as Error).message === 'cancelled') return { ok: false, cancelled: true }
    return { ok: false, error: (err as Error).message }
  }

  try {
    const t = await requestToken({ grant_type: 'authorization_code', code })
    persist(t)
    const built = await buildSession(t.accessToken)
    if (!built.ok) {
      clearAuth()
      return built
    }
    return built
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
