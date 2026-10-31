// Runs Kokoro TTS inside a Web Worker so speech generation never freezes the 3D scene.
import { KokoroTTS } from 'kokoro-js'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
let tts = null
let loadedDevice = null
let loading = null
let queue = Promise.resolve()

const post = (msg, transfer) => self.postMessage(msg, transfer || [])

async function create(device) {
  // q8 is small and fast on CPU/WASM; WebGPU needs fp32 for correct output.
  const dtype = device === 'webgpu' ? 'fp32' : 'q8'
  const seen = {}
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return
      seen[p.file] = { loaded: p.loaded, total: p.total }
      const files = Object.values(seen)
      const loaded = files.reduce((a, f) => a + f.loaded, 0)
      const total = files.reduce((a, f) => a + f.total, 0)
      post({ type: 'progress', progress: Math.round((loaded / total) * 100), loadedMB: +(loaded / 1e6).toFixed(1), totalMB: +(total / 1e6).toFixed(1) })
    },
  })
}

async function load(wanted) {
  if (tts && loadedDevice === wanted) return tts
  if (loading && loading.device === wanted) return loading.promise
  const promise = (async () => {
    post({ type: 'status', state: 'loading', device: wanted })
    try {
      tts = await create(wanted)
      loadedDevice = wanted
    } catch (err) {
      if (wanted !== 'webgpu') throw err
      post({ type: 'status', state: 'loading', device: 'wasm', note: `WebGPU failed (${err?.message || err}). Using CPU instead.` })
      tts = await create('wasm')
      loadedDevice = 'webgpu' // remember the request so we don't retry WebGPU every call
    }
    post({ type: 'status', state: 'ready', device: wanted })
    return tts
  })()
  loading = { device: wanted, promise }
  try {
    return await promise
  } finally {
    loading = null
  }
}

self.onmessage = (e) => {
  const { id, type, device, text, voice, speed } = e.data
  if (type === 'load') {
    load(device).catch((err) => post({ type: 'status', state: 'error', error: String(err?.message || err) }))
    return
  }
  if (type === 'generate') {
    // One generation at a time: the ONNX session can't run two in parallel.
    queue = queue
      .then(async () => {
        const model = await load(device)
        const audio = await model.generate(text, { voice, speed })
        const wav = audio.toWav()
        post({ id, type: 'audio', wav }, [wav])
      })
      .catch((err) => post({ id, type: 'error', error: String(err?.message || err) }))
  }
}
