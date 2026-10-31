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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    worker: { format: 'es' },
    define: { __OLLAMA_URL__: JSON.stringify(env.OLLAMA_URL || '') },
    // Pre-bundle Kokoro up front so the dev server doesn't reload the page
    // the first time the voice worker starts.
    optimizeDeps: { include: ['kokoro-js'] },
    server: { proxy: proxies(env) },
    preview: { proxy: proxies(env) },
  }
})
