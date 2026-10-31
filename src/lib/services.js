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

/** 'proxy' sends calls through the local dev server; 'direct' calls each API from the browser. */
export function setConnectionMode(m) {
  mode = m === 'direct' ? 'direct' : 'proxy'
}

export const getConnectionMode = () => mode

export function endpoint(service, path) {
  return (mode === 'direct' ? SERVICES[service].url : `/proxy/${service}`) + path
}

/** A helpful message when fetch() itself fails (no HTTP response at all). */
export function unreachable(service) {
  const label = SERVICES[service].label
  if (mode === 'direct') {
    const extra = service === 'ollama' ? ' For Ollama, start it with OLLAMA_ORIGINS="*" so it accepts browser calls.' : ''
    return `Your browser couldn't reach ${label} directly. It may block calls from web pages (CORS).${extra} Switch Connection to Proxy in Settings, or check your internet.`
  }
  return `Couldn't reach ${label} through the proxy. Is the dev server running (npm run dev or npm run preview)?`
}
