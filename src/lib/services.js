/* global __OLLAMA_URL__ */
// One list of API servers, shared by the dev-server proxy (vite.config.js)
// and by direct mode in the browser.

const ollamaUrl = typeof __OLLAMA_URL__ !== 'undefined' && __OLLAMA_URL__ ? __OLLAMA_URL__ : 'http://127.0.0.1:11434'

export const SERVICES = {
  anthropic: { label: 'Claude', url: 'https://api.anthropic.com' },
  groq: { label: 'Groq', url: 'https://api.groq.com' },
  gemini: { label: 'Gemini', url: 'https://generativelanguage.googleapis.com' },
  ollama: { label: 'Ollama', url: ollamaUrl },
  chatjimmy: { label: 'ChatJimmy', url: 'https://chatjimmy.ai' },
  elevenlabs: { label: 'ElevenLabs', url: 'https://api.elevenlabs.io' },
  fish: { label: 'Fish Audio', url: 'https://api.fish.audio' },
}

let mode = 'proxy'
let workerUrl = ''

/**
 * 'proxy'  → /proxy on this site (the Vite dev server locally, or the Cloudflare Worker when it serves the site)
 * 'direct' → the browser calls each API itself
 * 'worker' → a Cloudflare Worker at another address
 */
export function setConnectionMode(m, url = '') {
  mode = ['direct', 'worker'].includes(m) ? m : 'proxy'
  workerUrl = String(url || '').trim().replace(/\/+$/, '')
}

export const getConnectionMode = () => mode

export function endpoint(service, path) {
  if (mode === 'direct') return SERVICES[service].url + path
  if (mode === 'worker') {
    if (!workerUrl) throw new Error('Add your Cloudflare Worker URL in Settings → Connection.')
    return `${workerUrl}/proxy/${service}${path}`
  }
  return `/proxy/${service}${path}`
}

/** A helpful message when fetch() itself fails (no HTTP response at all). */
export function unreachable(service) {
  const label = SERVICES[service].label
  if (mode === 'direct') {
    const extra = service === 'ollama' ? ' For Ollama, start it with OLLAMA_ORIGINS="*" so it accepts browser calls.' : ''
    return `Your browser couldn't reach ${label} directly. It may block calls from web pages (CORS).${extra} Switch Connection to Proxy in Settings, or check your internet.`
  }
  if (mode === 'worker') {
    if (!workerUrl) return 'Add your Cloudflare Worker URL in Settings → Connection.'
    const extra = service === 'ollama' ? ' A Cloudflare Worker cannot reach Ollama on your computer; use Proxy or Direct for Ollama.' : ''
    return `Couldn't reach ${label} through your Cloudflare Worker at ${workerUrl}. Check the URL, and that ALLOWED_ORIGINS in wrangler.toml includes this site.${extra}`
  }
  return `Couldn't reach ${label} through the proxy. Is the dev server running (npm run dev or npm run preview)?`
}

/**
 * Fetch any URL (MCP servers, OAuth endpoints) through the same connection mode.
 * Proxy and Worker modes pass the target in an X-Target-URL header to /proxy/any.
 */
export async function relayFetch(url, init = {}) {
  const headers = new Headers(init.headers || {})
  let target = url
  if (mode !== 'direct') {
    headers.set('X-Target-URL', url)
    if (mode === 'worker') {
      if (!workerUrl) throw new Error('Add your Cloudflare Worker URL in Settings → Connection.')
      target = `${workerUrl}/proxy/any`
    } else target = '/proxy/any'
  }
  try {
    return await fetch(target, { ...init, headers })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    const host = (() => {
      try {
        return new URL(url).host
      } catch {
        return url
      }
    })()
    const err = new Error(
      mode === 'direct'
        ? `Your browser couldn't reach ${host} directly. The server may not allow calls from web pages (CORS). Switch Connection to Proxy in Settings, or check the URL.`
        : mode === 'worker'
          ? `Couldn't reach ${host} through your Cloudflare Worker. Check the Worker URL and that this site is in ALLOWED_ORIGINS.`
          : `Couldn't reach ${host} through the proxy. Is the dev server running (npm run dev or npm run preview)?`,
    )
    err.network = true
    throw err
  }
}
