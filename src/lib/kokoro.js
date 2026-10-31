// Main-thread client for the Kokoro worker.

const label = (id) => {
  const accent = id[0] === 'b' ? 'British' : 'American'
  const g = id[1] === 'f' ? 'female' : 'male'
  const name = id.slice(3)
  return `${name[0].toUpperCase()}${name.slice(1)} (${accent} ${g})`
}

// Sorted roughly by quality grade from the Kokoro voice card.
export const KOKORO_VOICES = [
  'af_heart', 'af_bella', 'af_nicole', 'bf_emma', 'af_aoede', 'af_kore', 'af_sarah', 'af_alloy', 'af_nova',
  'af_sky', 'bf_isabella', 'af_jessica', 'af_river', 'bf_alice', 'bf_lily',
  'am_michael', 'am_fenrir', 'am_puck', 'bm_george', 'bm_fable', 'bm_lewis', 'am_echo', 'am_eric', 'am_liam',
  'am_onyx', 'bm_daniel', 'am_santa', 'am_adam',
].map((id) => ({ id, label: label(id), gender: id[1] === 'f' ? 'female' : 'male' }))

export const resolveDevice = (pref) => {
  if (pref === 'webgpu' || pref === 'wasm') return pref
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
}

class KokoroClient {
  constructor() {
    this.worker = null
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Set()
    this.status = { state: 'idle', progress: 0, loadedMB: 0, totalMB: 0, device: null, error: null, note: null }
  }

  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getStatus = () => this.status

  _set(patch) {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((f) => f())
  }

  _worker() {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./kokoro.worker.js', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') this._set({ progress: m.progress, loadedMB: m.loadedMB, totalMB: m.totalMB })
      else if (m.type === 'status') this._set({ state: m.state, device: m.device, error: m.error || null, note: m.note ?? this.status.note })
      else if (m.id != null) {
        const p = this.pending.get(m.id)
        if (!p) return
        this.pending.delete(m.id)
        if (m.type === 'audio') p.resolve(new Blob([m.wav], { type: 'audio/wav' }))
        else p.reject(new Error(m.error || 'Kokoro failed'))
      }
    }
    this.worker.onerror = (e) => {
      this._set({ state: 'error', error: e.message || 'The Kokoro worker crashed.' })
      this.pending.forEach((p) => p.reject(new Error('The Kokoro worker crashed.')))
      this.pending.clear()
      this.worker = null
    }
    return this.worker
  }

  /** Start downloading the model (about 90 MB once, then cached by the browser). */
  preload(devicePref) {
    const device = resolveDevice(devicePref)
    if (this.status.state === 'ready' && this.status.device === device) return
    if (this.status.state === 'loading' && this.status.device === device) return
    this._set({ state: 'loading', device, progress: 0, error: null, note: null })
    this._worker().postMessage({ type: 'load', device })
  }

  isReady(devicePref) {
    return this.status.state === 'ready' && this.status.device === resolveDevice(devicePref)
  }

  /** Wait until the model is ready (or failed). */
  whenReady(devicePref) {
    this.preload(devicePref)
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.isReady(devicePref)) {
          unsub()
          resolve()
        } else if (this.status.state === 'error') {
          unsub()
          reject(new Error(this.status.error))
        }
      }
      const unsub = this.subscribe(check)
      check()
    })
  }

  generate(text, { voice = 'af_heart', speed = 1, device: devicePref, signal } = {}) {
    const device = resolveDevice(devicePref)
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
      this.pending.set(id, { resolve, reject })
      signal?.addEventListener('abort', () => {
        if (this.pending.delete(id)) reject(new DOMException('Aborted', 'AbortError'))
      })
      this._worker().postMessage({ id, type: 'generate', device, text, voice, speed })
    })
  }
}

export const kokoro = new KokoroClient()
