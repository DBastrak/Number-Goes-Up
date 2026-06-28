// Bungie API helpers — the login lookup.
//
// All requests send the `X-API-Key` header using the `bungieAPI` value from .env.
//
// NOTE on endpoints: the legacy `Destiny2/SearchDestinyPlayer/-1/{name}/` endpoint
// no longer resolves global Bungie names (it returns 0 results for everyone), so it
// can't be used as the existence check. The working flow is:
//   1. User/Search/Prefix/{name}/0/ ........ find the Guardian + their memberships
//   2. User/GetMembershipsById/{id}/{type}/ . resolve the primary membership id
// Both calls send X-API-Key.

import { bungieGet as getJson, bungiePost as postJson } from './client'

const BASE = 'https://www.bungie.net/Platform'

// Split "Name#1234" into { name, code }. Code is optional.
function parseBungieName(input) {
  const hash = input.lastIndexOf('#')
  if (hash === -1) return { name: input, code: null }
  return { name: input.slice(0, hash), code: input.slice(hash + 1) }
}

// Pick the active membership, honouring cross-save overrides.
function pickPrimaryMembership(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null
  return (
    memberships.find(
      (m) => m.crossSaveOverride === 0 || m.crossSaveOverride === m.membershipType
    ) || memberships[0]
  )
}

export async function lookupGuardian(rawUsername) {
  const username = (rawUsername || '').trim()
  console.log('[bungie] lookupGuardian:', JSON.stringify(username), 'key set:', !!process.env.bungieAPI)

  if (!process.env.bungieAPI) {
    return { ok: false, error: 'Bungie API key not set. Add it to the .env file (bungieAPI=...).' }
  }
  if (!username) {
    return { ok: false, error: 'Enter a Bungie name.' }
  }

  const { name, code } = parseBungieName(username)

  try {
    // --- Step 1: find the Guardian + their Destiny memberships ---
    let memberships
    let displayName = name
    let displayCode = code

    if (code) {
      // Exact lookup by full Bungie name. This is reliable for common names — unlike the
      // prefix search, which only returns the FIRST page so a specific #code can be missed.
      const found = await postJson(`${BASE}/Destiny2/SearchDestinyPlayerByBungieName/-1/`, {
        displayName: name,
        displayNameCode: Number(code)
      })
      if (found.body?.ErrorCode && found.body.ErrorCode !== 1) {
        return { ok: false, error: `Bungie error: ${found.body.Message || found.body.ErrorStatus}` }
      }
      memberships = found.body?.Response || []
      if (!Array.isArray(memberships) || memberships.length === 0) {
        return { ok: false, error: `No Guardian found for "${username}".` }
      }
      displayName = memberships[0].bungieGlobalDisplayName || name
      displayCode = String(memberships[0].bungieGlobalDisplayNameCode ?? code)
    } else {
      // No #code given — fall back to the prefix search and take the best name match.
      const search = await getJson(`${BASE}/User/Search/Prefix/${encodeURIComponent(name)}/0/`)
      if (search.body?.ErrorCode && search.body.ErrorCode !== 1) {
        return { ok: false, error: `Bungie error: ${search.body.Message || search.body.ErrorStatus}` }
      }
      const results = search.body?.Response?.searchResults
      if (!Array.isArray(results) || results.length === 0) {
        return { ok: false, error: `No Guardian found for "${username}".` }
      }
      const r =
        results.find((x) => (x.bungieGlobalDisplayName || '').toLowerCase() === name.toLowerCase()) ||
        results[0]
      memberships = r.destinyMemberships || []
      displayName = r.bungieGlobalDisplayName || name
      displayCode = String(r.bungieGlobalDisplayNameCode ?? '')
    }

    // --- Step 2: the membership id to query with ---
    const membership = pickPrimaryMembership(memberships)
    if (!membership) {
      return { ok: false, error: 'That Guardian has no Destiny memberships.' }
    }

    // --- Step 3: resolve the canonical primary membership id ---
    const byId = await getJson(
      `${BASE}/User/GetMembershipsById/${membership.membershipId}/${membership.membershipType}/`
    )
    const resp = byId.body?.Response
    const primaryMembershipId =
      resp?.primaryMembershipId ||
      pickPrimaryMembership(resp?.destinyMemberships)?.membershipId ||
      membership.membershipId

    const code4 = String(displayCode ?? '').padStart(4, '0')
    const session = {
      displayName: `${displayName}#${code4}`,
      membershipId: membership.membershipId,
      membershipType: membership.membershipType,
      primaryMembershipId,
      destinyMemberships: resp?.destinyMemberships || memberships || [],
      savedAt: new Date().toISOString()
    }

    return { ok: true, session }
  } catch (err) {
    return { ok: false, error: `Bungie API request failed: ${err.message}` }
  }
}
