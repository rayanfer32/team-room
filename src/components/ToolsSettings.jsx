import { useState } from 'react'
import { forgetConnection, isPublicHttps, listTools, McpError } from '../lib/mcp'
import { oauthRedirectUri, openSignInWindow, signIn } from '../lib/oauth'
import { isReadOnly, policyOf, toolKey } from '../lib/tools'

const newServer = () => ({
  id: `m${Math.random().toString(36).slice(2, 8)}`,
  label: 'New server',
  url: '',
  enabled: true,
  auth: 'none',
  headerName: 'Authorization',
  token: '',
  oauth: {},
  route: 'auto',
  tools: null,
  syncedAt: null,
  error: null,
})

function Seg({ value, options, onChange, label }) {
  return (
    <div className="segmented small" role="radiogroup" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {t}
        </button>
      ))}
    </div>
  )
}

function ServerCard({ server, onChange, onRemove, connection }) {
  const [busy, setBusy] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const set = (patch) => onChange({ ...server, ...patch })
  const signedIn = !!server.oauth?.accessToken
  const publicUrl = isPublicHttps(server.url)

  const load = async (sv = server) => {
    setBusy('Loading tools…')
    forgetConnection(sv.id)
    try {
      let latest = sv
      const tools = await listTools(sv, { onAuthUpdate: (oauth) => (latest = { ...latest, oauth }) })
      const old = Object.fromEntries((sv.tools || []).map((t) => [t.name, t.policy]))
      onChange({
        ...latest,
        tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description || '', inputSchema: t.inputSchema, annotations: t.annotations, policy: old[t.name] })),
        syncedAt: Date.now(),
        error: null,
      })
    } catch (e) {
      const needsAuth = e instanceof McpError && e.auth
      onChange({
        ...sv,
        error: needsAuth && sv.auth === 'none' ? `${e.message} Choose Token or OAuth below.` : e.message || String(e),
      })
    } finally {
      setBusy('')
    }
  }

  const doSignIn = async () => {
    const win = openSignInWindow() // must open inside the click
    setBusy('Signing in…')
    try {
      // Ask the server first, so its WWW-Authenticate header can point to the right metadata.
      let www = ''
      try {
        await listTools({ ...server, auth: 'none' })
      } catch (e) {
        www = e?.auth?.wwwAuthenticate || ''
      }
      const oauth = await signIn(server, { win, www })
      const next = { ...server, auth: 'oauth', oauth: { ...server.oauth, ...oauth }, error: null }
      onChange(next)
      setBusy('')
      await load(next)
    } catch (e) {
      onChange({ ...server, error: e.message || String(e) })
    } finally {
      setBusy('')
    }
  }

  const counts = server.tools
    ? {
        total: server.tools.length,
        auto: server.tools.filter((t) => policyOf(t) === 'auto').length,
        ask: server.tools.filter((t) => policyOf(t) === 'ask').length,
      }
    : null

  return (
    <details className="persona mcp-server" open={!server.tools}>
      <summary>
        <span className={`swatch ${server.enabled ? (server.error ? 'bad' : server.tools ? 'good' : 'idle') : 'off'}`} />
        <b>{server.label || 'Untitled server'}</b>
        <span className="muted">{counts ? `${counts.total} tools` : server.error ? 'needs attention' : 'not loaded'}</span>
      </summary>
      <div className="persona-body">
        <div className="two">
          <label className="field">
            <span className="field-label">Name</span>
            <input value={server.label} onChange={(e) => set({ label: e.target.value })} />
          </label>
          <label className="field check-field">
            <span className="field-label">Enabled</span>
            <input type="checkbox" checked={server.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">MCP endpoint URL</span>
          <input value={server.url} placeholder="https://example.com/mcp" onChange={(e) => set({ url: e.target.value.trim(), tools: server.url === e.target.value.trim() ? server.tools : server.tools })} spellCheck={false} />
          <span className="field-hint">The Streamable HTTP endpoint, often ending in /mcp.</span>
        </label>

        <span className="field-label">Authentication</span>
        <Seg
          label="Authentication"
          value={server.auth}
          options={[
            ['none', 'None'],
            ['bearer', 'Token'],
            ['oauth', 'OAuth sign-in'],
          ]}
          onChange={(v) => set({ auth: v })}
        />
        {server.auth === 'bearer' && (
          <div className="two spaced-top">
            <label className="field">
              <span className="field-label">Header</span>
              <input value={server.headerName} onChange={(e) => set({ headerName: e.target.value })} spellCheck={false} />
            </label>
            <label className="field">
              <span className="field-label">Token</span>
              <span className="secret">
                <input type={showSecret ? 'text' : 'password'} value={server.token} placeholder="Paste token" onChange={(e) => set({ token: e.target.value })} autoComplete="off" spellCheck={false} />
                <button type="button" className="link" onClick={() => setShowSecret((x) => !x)}>
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
          </div>
        )}
        {server.auth === 'bearer' && <p className="fine">For the Authorization header, "Bearer " is added automatically if you paste just the token.</p>}
        {server.auth === 'oauth' && (
          <div className="oauth-box">
            <p className="fine">
              {signedIn
                ? `Signed in${server.oauth.scope ? ` (scope: ${server.oauth.scope})` : ''}${server.oauth.registration ? `, app registered by ${server.oauth.registration}` : ''}.${server.oauth.expiresAt ? ` Token renews automatically.` : ''}`
                : 'Not signed in yet. A sign-in window opens for the service; allow pop-ups for this site.'}
            </p>
            <div className="row">
              <button className="btn primary small" onClick={doSignIn} disabled={!!busy || !server.url}>
                {signedIn ? 'Sign in again' : 'Sign in'}
              </button>
              {signedIn && (
                <button className="btn ghost small" onClick={() => set({ oauth: { clientId: server.oauth.clientId, scope: server.oauth.scope } })}>
                  Sign out
                </button>
              )}
            </div>
            <details className="mini">
              <summary className="link small-link">Advanced: client ID and scopes</summary>
              <div className="two spaced-top">
                <label className="field">
                  <span className="field-label">Client ID (if you registered one)</span>
                  <input value={server.oauth?.clientId || ''} onChange={(e) => set({ oauth: { ...server.oauth, clientId: e.target.value } })} spellCheck={false} />
                </label>
                <label className="field">
                  <span className="field-label">Scopes (optional)</span>
                  <input value={server.oauth?.scope || ''} onChange={(e) => set({ oauth: { ...server.oauth, scope: e.target.value } })} spellCheck={false} />
                </label>
              </div>
              <p className="fine">
                Redirect URL to register: <code>{oauthRedirectUri()}</code>. Without a client ID, the app registers itself if the service allows it.
              </p>
            </details>
          </div>
        )}

        <span className="field-label spaced-top">Who runs the tools</span>
        <Seg
          label="Who runs the tools"
          value={server.route}
          options={[
            ['auto', 'Provider when possible'],
            ['app', 'Always this app'],
          ]}
          onChange={(v) => set({ route: v })}
        />
        <p className="fine">
          {server.route === 'app'
            ? 'The app calls the server and passes results to the model. Works with every model that supports tools.'
            : publicUrl
              ? 'With Claude or Groq, the provider calls this server itself when a person has only auto-run tools from it. Otherwise the app runs them.'
              : 'Provider-run tools need a public https URL, so the app will run this server\u2019s tools.'}
          {connection === 'direct' ? ' In Direct connection mode the server must allow calls from web pages (CORS).' : ''}
        </p>

        {server.error && <p className="msg error">{server.error}</p>}
        <div className="row spaced-top">
          <button className="btn small" onClick={() => load()} disabled={!!busy || !server.url}>
            {busy || (server.tools ? 'Reload tools' : 'Connect and load tools')}
          </button>
          {confirm ? (
            <button className="btn ghost small danger" onClick={onRemove}>
              Remove for good
            </button>
          ) : (
            <button className="btn ghost small" onClick={() => setConfirm(true)}>
              Remove
            </button>
          )}
        </div>

        {server.tools && (
          <div className="toollist">
            <p className="fine">
              {counts.total} tools. {counts.auto} run automatically, {counts.ask} ask first. Read-only tools default to automatic. Give people access under People.
            </p>
            {server.tools.length === 0 && <p className="fine">This server has no tools.</p>}
            {server.tools.map((t, i) => (
              <div key={t.name} className="toolrow">
                <div className="toolrow-main">
                  <p className="toolname">
                    {t.title || t.name}
                    {isReadOnly(t) && <span className="tag">read-only</span>}
                    {t.annotations?.destructiveHint && <span className="tag warn">can change things</span>}
                  </p>
                  {t.description && <p className="fine tooldesc">{t.description}</p>}
                </div>
                <select
                  value={policyOf(t)}
                  aria-label={`When ${t.name} runs`}
                  onChange={(e) => onChange({ ...server, tools: server.tools.map((x, j) => (j === i ? { ...x, policy: e.target.value } : x)) })}
                >
                  <option value="auto">Automatic</option>
                  <option value="ask">Ask me</option>
                  <option value="off">Off</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

export default function ToolsSettings({ settings, update }) {
  const servers = settings.mcp.servers
  return (
    <section>
      <h3>MCP servers</h3>
      <p className="fine">
        Connect Model Context Protocol servers so people at the table can look things up or take actions during a meeting or interview. Servers must speak Streamable HTTP; local
        command-line (stdio) servers need an HTTP bridge. Each person only gets the tools you allow under People.
      </p>
      {servers.map((sv, i) => (
        <ServerCard
          key={sv.id}
          server={sv}
          connection={settings.connection}
          onChange={(next) => update((s) => (s.mcp.servers[i] = next))}
          onRemove={() =>
            update((s) => {
              s.mcp.servers.splice(i, 1)
              const drop = (p) => (p.tools = (p.tools || []).filter((k) => !k.startsWith(`${sv.id}:`)))
              s.personas.forEach(drop)
              s.interview.panel.forEach(drop)
            })
          }
        />
      ))}
      <button className="btn" onClick={() => update((s) => s.mcp.servers.push(newServer()))}>
        Add an MCP server
      </button>
    </section>
  )
}

/** Tool permissions for one person, shown in their card under People. */
export function PersonTools({ persona, settings, onChange }) {
  const servers = settings.mcp.servers.filter((sv) => sv.enabled && Array.isArray(sv.tools) && sv.tools.some((t) => policyOf(t) !== 'off'))
  const keys = new Set(persona.tools || [])
  if (!servers.length) return <p className="fine">No tools yet. Add an MCP server under Tools, load its tools, then choose what {persona.name} can use here.</p>
  const toggle = (k, on) => {
    const next = new Set(keys)
    if (on) next.add(k)
    else next.delete(k)
    onChange([...next])
  }
  return (
    <div className="person-tools">
      {servers.map((sv) => {
        const usable = sv.tools.filter((t) => policyOf(t) !== 'off')
        const all = usable.every((t) => keys.has(toolKey(sv.id, t.name)))
        return (
          <div key={sv.id} className="pt-server">
            <label className="check small">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => {
                  const next = new Set(keys)
                  usable.forEach((t) => (e.target.checked ? next.add(toolKey(sv.id, t.name)) : next.delete(toolKey(sv.id, t.name))))
                  onChange([...next])
                }}
              />
              <b>{sv.label}</b>
              <span className="muted">all tools</span>
            </label>
            <div className="pt-tools">
              {usable.map((t) => (
                <label key={t.name} className="check small">
                  <input type="checkbox" checked={keys.has(toolKey(sv.id, t.name))} onChange={(e) => toggle(toolKey(sv.id, t.name), e.target.checked)} />
                  {t.title || t.name}
                  <span className={`tag${policyOf(t) === 'ask' ? ' warn' : ''}`}>{policyOf(t) === 'auto' ? 'automatic' : 'asks you'}</span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
