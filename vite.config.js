import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Every API call goes through this local proxy, so the browser never hits
// CORS limits and your keys only travel between your machine and the provider.
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
  return {
    '/proxy/anthropic': route('https://api.anthropic.com', '/proxy/anthropic'),
    '/proxy/groq': route('https://api.groq.com', '/proxy/groq'),
    '/proxy/gemini': route('https://generativelanguage.googleapis.com', '/proxy/gemini'),
    '/proxy/ollama': route(env.OLLAMA_URL || 'http://127.0.0.1:11434', '/proxy/ollama'),
    '/proxy/elevenlabs': route('https://api.elevenlabs.io', '/proxy/elevenlabs'),
    '/proxy/fish': route('https://api.fish.audio', '/proxy/fish'),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: { proxy: proxies(env) },
    preview: { proxy: proxies(env) },
  }
})
