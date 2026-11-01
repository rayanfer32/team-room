// OAuth 2.1 sign-in for MCP servers, following the MCP authorization spec:
// protected resource metadata (RFC 9728) → authorization server metadata (RFC 8414 / OIDC)
// → client registration (pre-registered, Client ID Metadata Document, or Dynamic Client Registration)
// → authorization code with PKCE (S256) and resource indicators (RFC 8707) → tokens.

import { relayFetch } from './services'

const redirectUri = () => `${location.origin}/oauth-callback.html`

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)))
const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))

/** The MCP server URL in the canonical form used as the OAuth "resource". */
export function canonicalResource(url) {
  const u = new URL(url)
  u.hash = ''
  u.search = ''
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')
  return `${u.protocol}//${u.host.toLowerCase()}${path}`
}

async function getJson(url, signal) {
  const res = await relayFetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Pull resource_metadata and scope out of a WWW-Authenticate header. */
export function parseWwwAuthenticate(header) {
  const out = {}
  for (const m of String(header || '').matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

async function discoverResource(serverUrl, www, signal) {
  const hint = parseWwwAuthenticate(www)
  const u = new URL(serverUrl)
  const candidates = [hint.resource_metadata, `${u.origin}/.well-known/oauth-protected-resource${u.pathname.replace(/\/+$/, '')}`, `${u.origin}/.well-known/oauth-protected-resource`].filter(
    Boolean,
  )
  for (const c of [...new Set(candidates)]) {
    const doc = await getJson(c, signal)
    if (doc?.authorization_servers?.length) return { doc, scope: hint.scope }
  }
  throw new Error(`Couldn't find sign-in details for ${u.host}. The server didn't publish OAuth protected resource metadata, so use a token instead.`)
}

async function discoverAuthServer(issuer, signal) {
  const u = new URL(issuer)
  const path = u.pathname.replace(/\/+$/, '')
  const candidates = path
    ? [`${u.origin}/.well-known/oauth-authorization-server${path}`, `${u.origin}/.well-known/openid-configuration${path}`, `${u.origin}${path}/.well-known/openid-configuration`]
    : [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`]
  for (const c of candidates) {
    const doc = await getJson(c, signal)
    if (doc?.authorization_endpoint && doc?.token_endpoint) return doc
  }
  throw new Error(`Couldn't read the authorization server's metadata at ${u.host}.`)
}

const publicHttpsOrigin = () => location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname)

async function registerClient(meta, preset, signal) {
  if (preset?.trim()) return { clientId: preset.trim(), how: 'pre-registered' }
  if (meta.client_id_metadata_document_supported && publicHttpsOrigin()) return { clientId: `${location.origin}/oauth/client-metadata.json`, how: 'metadata document' }
  if (meta.registration_endpoint) {
    const res = await relayFetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'Team Room',
        client_uri: location.origin,
        redirect_uris: [redirectUri()],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
      signal,
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.client_id) return { clientId: body.client_id, how: 'dynamic registration' }
    throw new Error(`The authorization server refused to register this app (${res.status}${body.error ? `: ${body.error_description || body.error}` : ''}).`)
  }
  throw new Error(
    meta.client_id_metadata_document_supported
      ? 'This server registers apps through a public https site. Deploy Team Room (for example on the Cloudflare Worker), or paste a client ID you registered with the provider.'
      : 'This server needs an app registered with it first. Register one with the provider, using the redirect URL shown, and paste its client ID.',
  )
}

/** Open the sign-in window right away (inside the click) so pop-up blockers allow it. */
export function openSignInWindow() {
  const w = window.open('', 'mcp-oauth', 'width=520,height=720')
  if (w) w.document.write('<p style="font-family:system-ui;padding:24px">Preparing sign-in…</p>')
  return w
}

function waitForCallback(win, state, signal) {
  return new Promise((resolve, reject) => {
    const done = (fn, v) => {
      window.removeEventListener('message', onMsg)
      clearInterval(timer)
      fn(v)
    }
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'mcp-oauth') return
      if (e.data.state !== state) return
      if (e.data.error) done(reject, new Error(`Sign-in failed: ${e.data.error_description || e.data.error}`))
      else done(resolve, e.data)
    }
    window.addEventListener('message', onMsg)
    const timer = setInterval(() => {
      if (win.closed) done(reject, new Error('The sign-in window was closed before finishing.'))
    }, 600)
    signal?.addEventListener('abort', () => done(reject, new DOMException('Aborted', 'AbortError')))
  })
}

async function tokenRequest(endpoint, params, signal) {
  const res = await relayFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
    signal,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(`Token request failed (${res.status}${body.error ? `: ${body.error_description || body.error}` : ''}).`)
  return body
}

/**
 * Full sign-in. `win` comes from openSignInWindow(). `www` is a WWW-Authenticate header if a request already got 401.
 * Returns the oauth object to store on the server.
 */
export async function signIn(server, { win, www, signal } = {}) {
  try {
    const resource = canonicalResource(server.url)
    const { doc: prm, scope: hintedScope } = await discoverResource(server.url, www, signal)
    const issuer = prm.authorization_servers[0]
    const meta = await discoverAuthServer(issuer, signal)
    if (!(meta.code_challenge_methods_supported || ['S256']).includes('S256')) throw new Error("The authorization server doesn't support PKCE (S256), which MCP requires.")
    const { clientId, how } = await registerClient(meta, server.oauth?.clientId, signal)
    const scope = server.oauth?.scope?.trim() || hintedScope || (prm.scopes_supported || []).join(' ')
    const verifier = randomString(48)
    const state = randomString(16)
    const url = new URL(meta.authorization_endpoint)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri(),
      code_challenge: await sha256(verifier),
      code_challenge_method: 'S256',
      state,
      resource,
      ...(scope ? { scope } : {}),
    }).toString()
    if (!win || win.closed) throw new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.')
    win.location.href = url.toString()
    const cb = await waitForCallback(win, state, signal)
    if (meta.authorization_response_iss_parameter_supported && cb.iss && cb.iss !== meta.issuer) throw new Error('The sign-in response came from an unexpected issuer, so it was rejected.')
    const tok = await tokenRequest(meta.token_endpoint, { grant_type: 'authorization_code', code: cb.code, redirect_uri: redirectUri(), client_id: clientId, code_verifier: verifier, resource }, signal)
    return {
      clientId: server.oauth?.clientId || '', // only what the person typed in
      registeredClientId: clientId,
      registration: how,
      issuer: meta.issuer || issuer,
      tokenEndpoint: meta.token_endpoint,
      resource,
      scope: tok.scope || scope,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token || '',
      expiresAt: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    }
  } catch (e) {
    if (win && !win.closed) win.close()
    throw e
  }
}

export async function refreshOAuth(server, signal) {
  const o = server.oauth || {}
  if (!o.refreshToken || !o.tokenEndpoint) throw new Error('No refresh token; sign in again.')
  const tok = await tokenRequest(
    o.tokenEndpoint,
    { grant_type: 'refresh_token', refresh_token: o.refreshToken, client_id: o.registeredClientId || o.clientId, resource: o.resource || canonicalResource(server.url) },
    signal,
  )
  return {
    ...o,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token || o.refreshToken,
    expiresAt: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    scope: tok.scope || o.scope,
  }
}

export const oauthRedirectUri = redirectUri
