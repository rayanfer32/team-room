// Cloudflare Worker for Team Room.
// 1. Serves the built site (../dist) as static assets.
// 2. Relays /proxy/<service>/<path> to the provider APIs, so the browser never hits CORS limits.
//
// API keys stay in the browser: they arrive in each request's headers (or Gemini's ?key=)
// and are passed straight through. The Worker stores and logs nothing.

import { SERVICES } from '../../src/lib/services.js'

// Ollama runs on your own computer, which a Worker in Cloudflare's network can't reach.
const RELAY = Object.fromEntries(Object.entries(SERVICES).filter(([name]) => name !== 'ollama').map(([name, s]) => [name, s.url]))

const DROP_REQUEST_HEADERS = ['host', 'origin', 'referer', 'cookie', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip']

/** Which browser origins may use the relay. Requests from the Worker's own site are always allowed. */
function allowedOrigin(origin, selfOrigin, env) {
  if (!origin || origin === selfOrigin) return origin || selfOrigin
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  if (list.includes('*')) return '*'
  return list.includes(origin) ? origin : null
}

function corsHeaders(allow, request) {
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
    // MCP needs these readable from the browser.
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate, Retry-After, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** OAuth Client ID Metadata Document for MCP sign-in (served at /oauth/client-metadata.json). */
export function clientMetadata(origin) {
  return {
    client_id: `${origin}/oauth/client-metadata.json`,
    client_name: 'Team Room',
    client_uri: origin,
    redirect_uris: [`${origin}/oauth-callback.html`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

export async function relay(request, env) {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const allow = allowedOrigin(origin, url.origin, env)
  if (!allow) return json(403, { error: { message: `Origin ${origin} is not allowed. Add it to ALLOWED_ORIGINS in wrangler.toml.` } })
  const cors = corsHeaders(allow, request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(405, { error: { message: 'Only GET, POST and DELETE are relayed.' } }, cors)

  const [, , service, ...rest] = url.pathname.split('/')
  if (service === 'any') return relayAny(request, cors)
  if (service === 'ollama') return json(400, { error: { message: 'A Cloudflare Worker cannot reach Ollama on your computer. Use Proxy (dev server) or Direct for Ollama.' } }, cors)
  const base = RELAY[service]
  if (!base) return json(404, { error: { message: `Unknown service "${service}".` } }, cors)

  const headers = new Headers(request.headers)
  for (const h of DROP_REQUEST_HEADERS) headers.delete(h)
  let upstream
  try {
    upstream = await fetch(`${base}/${rest.join('/')}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : undefined,
      redirect: 'follow',
    })
  } catch (e) {
    return json(502, { error: { message: `The Worker couldn't reach ${service}: ${e.message || e}` } }, cors)
  }
  const out = new Headers(upstream.headers)
  out.delete('set-cookie')
  for (const [k, v] of Object.entries(cors)) out.set(k, v)
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}

/** /proxy/any: MCP servers and OAuth endpoints at arbitrary https URLs, named in X-Target-URL. */
async function relayAny(request, cors) {
  let target
  try {
    target = new URL(request.headers.get('X-Target-URL') || '')
  } catch {
    return json(400, { error: { message: 'Missing or invalid X-Target-URL header.' } }, cors)
  }
  if (target.protocol !== 'https:') return json(400, { error: { message: 'The Worker only relays to https URLs.' } }, cors)
  const headers = new Headers(request.headers)
  for (const h of [...DROP_REQUEST_HEADERS, 'x-target-url']) headers.delete(h)
  let upstream
  try {
    upstream = await fetch(target, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'follow' })
  } catch (e) {
    return json(502, { error: { message: `The Worker couldn't reach ${target.host}: ${e.message || e}` } }, cors)
  }
  const out = new Headers(upstream.headers)
  out.delete('set-cookie')
  for (const [k, v] of Object.entries(cors)) out.set(k, v)
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}

export default {
  async fetch(request, env) {
    const { pathname, origin } = new URL(request.url)
    if (pathname === '/oauth/client-metadata.json') return json(200, clientMetadata(origin), { 'Access-Control-Allow-Origin': '*' })
    if (pathname.startsWith('/proxy/')) return relay(request, env)
    if (env.ASSETS) return env.ASSETS.fetch(request)
    return new Response('Not found', { status: 404 })
  },
}
