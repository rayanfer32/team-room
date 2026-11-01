// A small MCP client for Streamable HTTP servers.
//
// It speaks the current revision (2026-07-28: no sessions, metadata on every request)
// and falls back to the earlier initialize-and-session handshake (2025-03-26 … 2025-11-25)
// as the spec's backward-compatibility section describes.

import { relayFetch } from './services'
import { refreshOAuth } from './oauth'

export const MODERN = '2026-07-28'
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26']
const CLIENT = { name: 'Team Room', version: '1.0.0' }
const HEADER_MISMATCH = -32020
const METHOD_NOT_FOUND = -32601

/** Per-server connection state: which protocol era worked, the negotiated version, any session id. */
const conns = new Map()
let rpcId = 0

export class McpError extends Error {
  constructor(message, { code, status, data, auth } = {}) {
    super(message)
    this.code = code
    this.status = status
    this.data = data
    this.auth = auth // { wwwAuthenticate } when the server asks for sign-in
  }
}

export const forgetConnection = (serverId) => conns.delete(serverId)

/** Header-safe value, or the Base64 sentinel form the spec requires. */
function headerValue(v) {
  const s = typeof v === 'boolean' ? String(v) : String(v)
  const safe = /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(s) && !(s.startsWith('=?base64?') && s.endsWith('?='))
  if (safe) return s
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return `=?base64?${btoa(bin)}?=`
}

/** Mirror tool parameters marked with x-mcp-header into Mcp-Param-* headers. */
function paramHeaders(schema, args) {
  const out = {}
  const walk = (node, value) => {
    if (!node || typeof node !== 'object' || !node.properties) return
    for (const [key, prop] of Object.entries(node.properties)) {
      const v = value?.[key]
      if (prop && typeof prop === 'object' && typeof prop['x-mcp-header'] === 'string' && v != null && typeof v !== 'object') out[`Mcp-Param-${prop['x-mcp-header']}`] = headerValue(v)
      if (prop?.properties && v && typeof v === 'object') walk(prop, v)
    }
  }
  walk(schema, args)
  return out
}

export function authHeaders(server) {
  if (server.auth === 'bearer' && server.token?.trim()) {
    const name = server.headerName?.trim() || 'Authorization'
    const raw = server.token.trim()
    const value = name.toLowerCase() === 'authorization' && !/^\w+\s/.test(raw) ? `Bearer ${raw}` : raw
    return { [name]: value }
  }
  if (server.auth === 'oauth' && server.oauth?.accessToken) return { Authorization: `Bearer ${server.oauth.accessToken}` }
  return {}
}

/** Read a JSON or SSE reply and pick out the JSON-RPC message answering `id`. */
async function readReply(res, id) {
  const type = res.headers.get('content-type') || ''
  const text = await res.text()
  if (!text.trim()) return null
  if (type.includes('text/event-stream')) {
    let last = null
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (!data) continue
      try {
        const msg = JSON.parse(data)
        if (msg.id === id && ('result' in msg || 'error' in msg)) return msg
        last = msg
      } catch {
        /* ignore keep-alives and partial frames */
      }
    }
    return last
  }
  try {
    const msg = JSON.parse(text)
    return Array.isArray(msg) ? msg.find((m) => m.id === id) || msg[0] : msg
  } catch {
    return { raw: text }
  }
}

async function post(server, body, headers, signal) {
  return relayFetch(server.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...authHeaders(server), ...headers },
    body: JSON.stringify(body),
    signal,
  })
}

function authError(res, server) {
  const www = res.headers.get('www-authenticate') || ''
  const msg =
    server.auth === 'oauth'
      ? `${server.label} needs you to sign in${server.oauth?.accessToken ? ' again' : ''} (Settings → Tools).`
      : server.auth === 'bearer'
        ? `${server.label} rejected the token (${res.status}). Check it in Settings → Tools.`
        : `${server.label} needs authentication. Add a token or sign in with OAuth in Settings → Tools.`
  return new McpError(msg, { status: res.status, auth: { wwwAuthenticate: www } })
}

function jsonRpcError(server, msg, status) {
  const e = msg?.error || {}
  return new McpError(`${server.label}: ${e.message || `request failed (${status})`}`, { code: e.code, status, data: e.data })
}

/** True when a 400/404/405 body is a modern-protocol error, so we should not fall back. */
function isModernError(msg) {
  const e = msg?.error
  if (!e) return false
  return e.code === HEADER_MISMATCH || e.code === METHOD_NOT_FOUND || Array.isArray(e.data?.supported) || /protocol version|client capabilit/i.test(e.message || '')
}

async function modernRequest(server, method, params, { signal, schema }) {
  const id = ++rpcId
  const body = {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MODERN,
        'io.modelcontextprotocol/clientInfo': CLIENT,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }
  const headers = { 'MCP-Protocol-Version': MODERN, 'Mcp-Method': method }
  const name = params?.name ?? params?.uri
  if (name != null && ['tools/call', 'resources/read', 'prompts/get'].includes(method)) headers['Mcp-Name'] = headerValue(name)
  if (method === 'tools/call' && schema) Object.assign(headers, paramHeaders(schema, params.arguments))
  const res = await post(server, body, headers, signal)
  return { res, msg: res.status === 401 || res.status === 403 ? null : await readReply(res, id) }
}

async function legacyInit(server, signal, conn) {
  const id = ++rpcId
  const res = await post(server, { jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: LEGACY[0], capabilities: {}, clientInfo: CLIENT } }, {}, signal)
  if (res.status === 401 || res.status === 403) throw authError(res, server)
  const msg = await readReply(res, id)
  if (!res.ok || msg?.error) {
    if (res.status === 404 || res.status === 405)
      throw new McpError(
        `${server.label} doesn't answer MCP at this URL. If it's an older HTTP+SSE server (URL often ends in /sse), use its Streamable HTTP endpoint instead (often /mcp).`,
        { status: res.status },
      )
    throw jsonRpcError(server, msg, res.status)
  }
  conn.era = 'legacy'
  conn.version = msg?.result?.protocolVersion || LEGACY[0]
  conn.sessionId = res.headers.get('mcp-session-id') || null
  await post(server, { jsonrpc: '2.0', method: 'notifications/initialized' }, legacyHeaders(conn), signal).catch(() => {})
}

const legacyHeaders = (conn) => ({ 'MCP-Protocol-Version': conn.version, ...(conn.sessionId ? { 'Mcp-Session-Id': conn.sessionId } : {}) })

async function legacyRequest(server, method, params, { signal }, conn, retried = false) {
  const id = ++rpcId
  const res = await post(server, { jsonrpc: '2.0', id, method, params }, legacyHeaders(conn), signal)
  if (res.status === 401 || res.status === 403) throw authError(res, server)
  if (res.status === 404 && conn.sessionId && !retried) {
    // Session expired: start a new one and try once more.
    await legacyInit(server, signal, conn)
    return legacyRequest(server, method, params, { signal }, conn, true)
  }
  const msg = await readReply(res, id)
  if (!res.ok || msg?.error) {
    if (!conn.sessionId && /session/i.test(msg?.error?.message || ''))
      throw new McpError(
        `${server.label} uses sessions, but the browser can't read its Mcp-Session-Id header. Switch Connection to Proxy (or Cloudflare Worker) in Settings.`,
        { status: res.status },
      )
    throw jsonRpcError(server, msg, res.status)
  }
  return msg?.result
}

/** One JSON-RPC request, with protocol detection, OAuth refresh and helpful errors. */
async function rpc(server, method, params = {}, opts = {}) {
  const { signal, onAuthUpdate } = opts
  if (!server.url?.trim()) throw new McpError(`${server.label || 'This server'} has no URL.`)
  let conn = conns.get(server.id)
  if (!conn) {
    conn = { era: null }
    conns.set(server.id, conn)
  }

  // Refresh an OAuth token that has expired (or is about to).
  if (server.auth === 'oauth' && server.oauth?.refreshToken && server.oauth.expiresAt && server.oauth.expiresAt < Date.now() + 30_000) {
    try {
      server = { ...server, oauth: await refreshOAuth(server) }
      onAuthUpdate?.(server.oauth)
    } catch {
      /* fall through: the server will answer 401 and the person can sign in again */
    }
  }

  try {
    if (conn.era !== 'legacy') {
      const { res, msg } = await modernRequest(server, method, params, opts)
      if (res.status === 401 || res.status === 403) throw authError(res, server)
      if (res.ok && msg && !msg.error && !msg.raw) {
        conn.era = 'modern'
        return msg.result
      }
      const fallBack = conn.era !== 'modern' && [400, 404, 405].includes(res.status) && !isModernError(msg)
      if (!fallBack) {
        if (msg?.error?.data?.supported) {
          const ours = msg.error.data.supported.find((v) => LEGACY.includes(v))
          if (!ours) throw new McpError(`${server.label} only supports MCP ${msg.error.data.supported.join(', ')}, which this app doesn't speak yet.`)
        } else if (!res.ok || msg?.error) throw jsonRpcError(server, msg, res.status)
      }
      await legacyInit(server, signal, conn)
    }
    return await legacyRequest(server, method, params, opts, conn)
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // An auth failure with a refresh token: refresh once and retry.
    if (e instanceof McpError && e.auth && server.auth === 'oauth' && server.oauth?.refreshToken && !opts.refreshed) {
      try {
        const oauth = await refreshOAuth(server)
        onAuthUpdate?.(oauth)
        return rpc({ ...server, oauth }, method, params, { ...opts, refreshed: true })
      } catch {
        /* report the original problem */
      }
    }
    if (e instanceof McpError) throw e
    throw new McpError(e.message || String(e))
  }
}

/** All tools on a server (following pagination). */
export async function listTools(server, opts = {}) {
  const tools = []
  let cursor
  for (let page = 0; page < 20; page++) {
    const result = await rpc(server, 'tools/list', cursor ? { cursor } : {}, opts)
    for (const t of result?.tools || []) if (t?.name) tools.push(t)
    cursor = result?.nextCursor
    if (!cursor) break
  }
  return tools
}

export async function callTool(server, name, args, opts = {}) {
  return rpc(server, 'tools/call', { name, arguments: args || {} }, opts)
}

/** Turn an MCP tool result into text a model can read. */
export function resultText(result, limit = 6000) {
  if (!result) return ''
  const parts = []
  for (const c of result.content || []) {
    if (c.type === 'text') parts.push(c.text)
    else if (c.type === 'resource' && c.resource?.text) parts.push(c.resource.text)
    else if (c.type === 'resource_link') parts.push(`[link: ${c.name || c.uri}]`)
    else if (c.type === 'image') parts.push('[image omitted]')
    else if (c.type === 'audio') parts.push('[audio omitted]')
  }
  if (!parts.length && result.structuredContent) parts.push(JSON.stringify(result.structuredContent))
  const text = parts.join('\n').trim()
  return text.length > limit ? `${text.slice(0, limit)}\n…(truncated)` : text
}

/** Public https URL, reachable by a provider's own servers (needed for built-in MCP). */
export function isPublicHttps(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return !(
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h === '[::1]'
    )
  } catch {
    return false
  }
}
