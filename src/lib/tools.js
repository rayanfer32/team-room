// Which MCP tools a model call gets, and how they are exposed.

import { isPublicHttps, authHeaders } from './mcp'

export const toolKey = (serverId, name) => `${serverId}:${name}`

/** auto = runs without asking; ask = needs your OK; off = never offered. Default: read-only tools run automatically. */
export const policyOf = (tool) => tool.policy || (tool.annotations?.readOnlyHint === true ? 'auto' : 'ask')
export const isReadOnly = (tool) => tool.annotations?.readOnlyHint === true

export const liveServers = (s) => (s.mcp?.servers || []).filter((sv) => sv.enabled && sv.url?.trim() && Array.isArray(sv.tools))

/** Tools this person may use: allowed for them, on an enabled server, and not switched off. */
export function allowedFor(s, persona) {
  const keys = new Set(persona?.tools || [])
  const out = []
  for (const server of liveServers(s))
    for (const tool of server.tools) if (keys.has(toolKey(server.id, tool.name)) && policyOf(tool) !== 'off') out.push({ server, tool })
  return out
}

const slug = (label) => {
  const s = String(label || 'mcp')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  return /^[a-z]/.test(s) ? s : `m_${s}`
}

/**
 * Build the tool list for one call.
 * speakers: the people this call writes for (one person, or the whole team for the one-writer engine).
 * writer: true when one model voices several people; each tool then gets a required _speaker field
 * limited to the people allowed to use it, and the app checks it before running anything.
 */
export function buildToolSet(s, speakers, { writer = false } = {}) {
  const entries = new Map()
  for (const p of speakers)
    for (const { server, tool } of allowedFor(s, p)) {
      const key = toolKey(server.id, tool.name)
      if (!entries.has(key)) entries.set(key, { server, tool, people: [] })
      entries.get(key).people.push(p.name)
    }
  if (!entries.size) return null
  const used = new Set()
  const tools = [...entries.values()].map(({ server, tool, people }) => {
    let name = `${slug(server.label)}__${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    while (used.has(name)) name = `${name.slice(0, 58)}_${used.size}`
    used.add(name)
    let schema = JSON.parse(JSON.stringify(tool.inputSchema || { type: 'object', properties: {} }))
    if (schema.type !== 'object') schema = { type: 'object', properties: {} }
    schema.properties = schema.properties || {}
    if (writer) {
      schema.properties._speaker = { type: 'string', enum: people, description: 'The person using this tool. Must be one of the listed people.' }
      schema.required = [...new Set([...(schema.required || []), '_speaker'])]
    }
    const about = (tool.description || tool.title || tool.name).slice(0, 1000)
    return {
      callName: name,
      server,
      tool,
      people,
      policy: policyOf(tool),
      description: writer ? `${about} (Only ${people.join(', ')} may use this.)` : about,
      schema,
    }
  })
  return { tools, byName: Object.fromEntries(tools.map((t) => [t.callName, t])), writer }
}

/**
 * When the provider can run MCP itself (Claude, Groq): only for one person's call,
 * only public https servers set to "built-in when possible", and only tools that run without asking.
 * Returns null when the app should run the tools instead.
 */
export function builtinPlan(toolSet, provider) {
  if (!toolSet || toolSet.writer || !['claude', 'groq'].includes(provider)) return null
  const servers = new Map()
  for (const t of toolSet.tools) {
    const sv = t.server
    if (t.policy !== 'auto' || sv.route === 'app' || !isPublicHttps(sv.url)) return null
    const headers = authHeaders(sv)
    const names = Object.keys(headers)
    if (provider === 'claude' && names.length && (names.length > 1 || names[0].toLowerCase() !== 'authorization')) return null
    if (!servers.has(sv.id)) servers.set(sv.id, { server: sv, name: slug(sv.label), headers, token: (headers.Authorization || '').replace(/^Bearer\s+/i, ''), tools: [] })
    servers.get(sv.id).tools.push(t.tool.name)
  }
  return [...servers.values()]
}
