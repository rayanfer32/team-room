import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { SERVICES } from './src/lib/services.js'

// In Proxy mode every API call goes through this local dev server, so the browser
// never hits CORS limits. Direct mode skips it (Settings → Connection).
function proxies(env) {
  const route = (target, prefix) => ({
    target,
    changeOrigin: true,
    secure: target.startsWith('https'),
    rewrite: (path) => path.replace(new RegExp('^' + prefix), ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (req) => {
        req.removeHeader('origin')
        req.removeHeader('referer')
      })
    },
  })
  const table = Object.fromEntries(
    Object.entries(SERVICES).map(([name, svc]) => {
      const target = name === 'ollama' ? env.OLLAMA_URL || svc.url : svc.url
      return [`/proxy/${name}`, route(target, `/proxy/${name}`)]
    }),
  )
  return table
}

const HOP = ['host', 'origin', 'referer', 'cookie', 'connection', 'content-length', 'accept-encoding', 'x-target-url', 'keep-alive', 'transfer-encoding', 'upgrade']

/** /proxy/any: relays to the URL in X-Target-URL (MCP servers and OAuth endpoints). Dev and preview only. */
function anyRelay() {
  const handler = async (req, res) => {
    const target = req.headers['x-target-url']
    let url
    try {
      url = new URL(String(target))
      if (!/^https?:$/.test(url.protocol)) throw new Error('bad scheme')
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: { message: 'Missing or invalid X-Target-URL header.' } }))
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.includes(k.toLowerCase())) headers[k] = v
    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        redirect: 'follow',
      })
      res.statusCode = upstream.status
      upstream.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'].includes(k)) res.setHeader(k, v)
      })
      if (upstream.body) for await (const chunk of upstream.body) res.write(chunk)
      res.end()
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: `The dev server couldn't reach ${url.host}: ${e.cause?.code || e.message}` } }))
    }
  }
  // OAuth Client ID Metadata Document. Authorization servers can only fetch it when this site is public over https.
  const metadata = (req, res) => {
    const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(clientMetadata(origin)))
  }
  const install = (server) => {
    server.middlewares.use('/proxy/any', handler)
    server.middlewares.use('/oauth/client-metadata.json', metadata)
  }
  return { name: 'team-room-relay', configureServer: install, configurePreviewServer: install }
}

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), anyRelay()],
    worker: { format: 'es' },
    define: { __OLLAMA_URL__: JSON.stringify(env.OLLAMA_URL || '') },
    // Pre-bundle Kokoro up front so the dev server doesn't reload the page
    // the first time the voice worker starts.
    optimizeDeps: { include: ['kokoro-js'] },
    server: { proxy: proxies(env) },
    preview: { proxy: proxies(env) },
  }
})
