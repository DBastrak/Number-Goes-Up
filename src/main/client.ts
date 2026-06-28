// Shared Bungie HTTP client. Every request carries the X-API-Key from .env.
// Retries on rate-limiting / throttling so large accounts don't silently undercount.

export function apiHeaders() {
  return {
    'X-API-Key': process.env.bungieAPI || '',
    'Content-Type': 'application/json'
  }
}

// PlatformErrorCodes that indicate throttling.
const THROTTLE_CODES = new Set([36, 51, 52, 53])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const backoff = (attempt) => Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250)

// POST with the same throttle-retry behaviour as bungieGet.
export async function bungiePost(url, body, { retries = 6 } = {}) {
  let attempt = 0
  for (;;) {
    let res
    let data = null
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body || {})
      })
      try {
        data = await res.json()
      } catch {
        data = null
      }
    } catch (err) {
      if (attempt >= retries) throw err
      await sleep(backoff(attempt++))
      continue
    }
    const ec = data?.ErrorCode
    const throttled = res.status === 429 || THROTTLE_CODES.has(ec)
    if (throttled && attempt < retries) {
      const wait = data?.ThrottleSeconds ? data.ThrottleSeconds * 1000 + 250 : backoff(attempt)
      await sleep(wait)
      attempt++
      continue
    }
    if (res.status !== 200 || (ec && ec !== 1)) {
      console.log('[bungie]', res.status, 'EC', ec, data?.ErrorStatus || data?.Message || '', url)
    }
    return { status: res.status, body: data }
  }
}

export async function bungieGet(url, { retries = 6 } = {}) {
  let attempt = 0

  for (;;) {
    let res
    let body = null
    try {
      res = await fetch(url, { method: 'GET', headers: apiHeaders() })
      try {
        body = await res.json()
      } catch {
        body = null
      }
    } catch (err) {
      // Network-level failure — retry a few times before giving up.
      if (attempt >= retries) throw err
      await sleep(backoff(attempt++))
      continue
    }

    const ec = body?.ErrorCode
    const throttled = res.status === 429 || THROTTLE_CODES.has(ec)
    if (throttled && attempt < retries) {
      const wait = body?.ThrottleSeconds ? body.ThrottleSeconds * 1000 + 250 : backoff(attempt)
      console.log(`[bungie] throttled (status ${res.status}, EC ${ec}) — waiting ${wait}ms`)
      await sleep(wait)
      attempt++
      continue
    }

    // Log only non-success so high-volume loads don't flood the console.
    if (res.status !== 200 || (ec && ec !== 1)) {
      console.log('[bungie]', res.status, 'EC', ec, body?.ErrorStatus || body?.Message || '', url)
    }
    return { status: res.status, body }
  }
}
