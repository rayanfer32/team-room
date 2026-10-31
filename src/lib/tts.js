import { readError } from './llm'
import { kokoro } from './kokoro'

export const TTS_PROVIDERS = {
  elevenlabs: { label: 'ElevenLabs', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  fish: { label: 'Fish Audio', keyUrl: 'https://fish.audio/app/api-keys/' },
  kokoro: { label: 'Kokoro', keyUrl: '' },
  browser: { label: 'Browser voice', keyUrl: '' },
}

const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|zira|susan|hazel|veena|fiona|serena|allison|ava|aria|jenny|libby|sonia|natasha|heera|kalpana|neerja|catherine|google us english|google uk english female/i
const MALE = /(^|[^e])male|daniel|alex|fred|david|mark|george|rishi|guy|ryan|thomas|oliver|arthur|aaron|ravi|prabhat|google uk english male/i

async function elevenLabs(text, persona, tts, signal) {
  const voiceId = persona.voice?.elevenlabs?.trim() || '21m00Tcm4TlvDq8ikWAM'
  const res = await fetch(`/proxy/elevenlabs/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': tts.elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: tts.elevenModel || 'eleven_flash_v2_5',
      voice_settings: { stability: 0.45, similarity_boost: 0.8 },
    }),
    signal,
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.blob()
}

async function fishAudio(text, persona, tts, signal) {
  const body = { text, format: 'mp3', normalize: true, latency: 'balanced' }
  if (persona.voice?.fish?.trim()) body.reference_id = persona.voice.fish.trim()
  const res = await fetch('/proxy/fish/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tts.fishKey}`, 'Content-Type': 'application/json', model: tts.fishModel || 's1' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.blob()
}

/**
 * Plays speech and writes a 0–1 mouth amplitude into live.amp
 * so the 3D characters can lip-flap in time with the audio.
 */
export class VoicePlayer {
  constructor(live) {
    this.live = live
    this.ctx = null
    this.current = null
    this.failed = new Set()
    this.voices = []
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => (this.voices = window.speechSynthesis.getVoices())
      load()
      window.speechSynthesis.addEventListener?.('voiceschanged', load)
    }
  }

  /** Call from a click handler so browsers allow audio. */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!this.ctx && AC) this.ctx = new AC()
    this.ctx?.resume?.()
  }

  resetFailures() {
    this.failed.clear()
  }

  englishVoices() {
    const en = this.voices.filter((v) => /^en/i.test(v.lang))
    return en.length ? en : this.voices
  }

  pickBrowserVoice(persona, slot = 0) {
    const all = this.englishVoices()
    const chosen = persona.voice?.browserVoice && this.voices.find((v) => v.name === persona.voice.browserVoice)
    if (chosen) return chosen
    const pool = all.filter((v) => (persona.gender === 'male' ? MALE.test(v.name) && !FEMALE.test(v.name) : FEMALE.test(v.name)))
    const list = pool.length ? pool : all
    return list.length ? list[slot % list.length] : null
  }

  stop() {
    if (this.current) {
      const c = this.current
      this.current = null
      c.cancel()
    }
  }

  /** Returns an audio Blob from the chosen cloud voice, or null to use the browser voice. */
  async fetchAudio(text, persona, tts, { signal, onNote, wait = false } = {}) {
    const p = tts.provider
    if (p === 'kokoro') return this._kokoro(text, persona, tts, { signal, onNote, wait })
    if (p !== 'elevenlabs' && p !== 'fish') return null
    const label = TTS_PROVIDERS[p].label
    const key = p === 'elevenlabs' ? tts.elevenKey : tts.fishKey
    if (!key) {
      onNote?.(`No ${label} key yet, so the browser voice is speaking. Add one in Settings.`)
      return null
    }
    if (this.failed.has(p)) return null
    try {
      const blob = p === 'elevenlabs' ? await elevenLabs(text, persona, tts, signal) : await fishAudio(text, persona, tts, signal)
      onNote?.(null)
      return blob
    } catch (e) {
      if (e.name === 'AbortError') throw e
      this.failed.add(p)
      onNote?.(`${label} stopped working (${e.message}). Switched to the browser voice for this meeting.`)
      return null
    }
  }

  async _kokoro(text, persona, tts, { signal, onNote, wait }) {
    if (this.failed.has('kokoro')) return null
    const device = tts.kokoroDevice
    const giveUp = (msg) => {
      this.failed.add('kokoro')
      onNote?.(`Kokoro stopped working (${msg}). Switched to the browser voice for this meeting.`)
      return null
    }
    if (!kokoro.isReady(device)) {
      if (wait) {
        try {
          await kokoro.whenReady(device)
        } catch (e) {
          return giveUp(e.message)
        }
      } else {
        kokoro.preload(device)
        if (kokoro.getStatus().state === 'error') return giveUp(kokoro.getStatus().error)
        onNote?.('Kokoro voices are still downloading, so the browser voice is speaking for now.')
        return null
      }
    }
    try {
      const voice = persona.voice?.kokoro || (persona.gender === 'male' ? 'am_michael' : 'af_heart')
      const blob = await kokoro.generate(text, { voice, speed: persona.voice?.rate ?? 1, device, signal })
      onNote?.(null)
      return blob
    } catch (e) {
      if (e.name === 'AbortError') throw e
      return giveUp(e.message)
    }
  }

  play(audio, text, persona, slot) {
    this.stop()
    return audio ? this._playBlob(audio) : this._speakBrowser(text, persona, slot)
  }

  _fakeMouth(t0) {
    const t = (performance.now() - t0) / 1000
    this.live.amp = 0.25 + 0.55 * Math.abs(Math.sin(t * 10.5)) * Math.abs(Math.sin(t * 3.1 + 0.6))
  }

  _playBlob(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      let analyser, data, src, raf
      const t0 = performance.now()
      if (this.ctx && this.ctx.state === 'running') {
        try {
          src = this.ctx.createMediaElementSource(audio)
          analyser = this.ctx.createAnalyser()
          analyser.fftSize = 512
          data = new Uint8Array(analyser.fftSize)
          src.connect(analyser)
          analyser.connect(this.ctx.destination)
        } catch {
          analyser = null
        }
      }
      const tick = () => {
        if (analyser) {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const x = (data[i] - 128) / 128
            sum += x * x
          }
          this.live.amp = Math.min(1, Math.sqrt(sum / data.length) * 4.5)
        } else this._fakeMouth(t0)
        raf = requestAnimationFrame(tick)
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        cancelAnimationFrame(raf)
        this.live.amp = 0
        audio.pause()
        try {
          src?.disconnect()
          analyser?.disconnect()
        } catch {
          /* already disconnected */
        }
        URL.revokeObjectURL(url)
        if (this.current === handle) this.current = null
        resolve()
      }
      const handle = { cancel: finish }
      this.current = handle
      audio.onended = finish
      audio.onerror = finish
      audio.play().then(tick).catch(finish)
    })
  }

  _speakBrowser(text, persona, slot) {
    return new Promise((resolve) => {
      const words = text.split(/\s+/).length
      const t0 = performance.now()
      let raf, timer
      let done = false
      const tick = () => {
        this._fakeMouth(t0)
        raf = requestAnimationFrame(tick)
      }
      const finish = (cancelled) => {
        if (done) return
        done = true
        cancelAnimationFrame(raf)
        clearTimeout(timer)
        this.live.amp = 0
        if (cancelled && 'speechSynthesis' in window) window.speechSynthesis.cancel()
        if (this.current === handle) this.current = null
        resolve()
      }
      const handle = { cancel: () => finish(true) }
      this.current = handle
      // If speech ends suspiciously early (no voices, blocked audio), keep the
      // character "talking" for a natural reading time so lines don't fly past.
      const minMs = 900 + words * 300
      const settle = () => {
        const left = minMs - (performance.now() - t0)
        if (left > 50 && !done) timer = setTimeout(() => finish(false), left)
        else finish(false)
      }

      if (!('speechSynthesis' in window)) {
        // No speech support: animate for about the time it takes to read the line.
        timer = setTimeout(() => finish(false), 1200 + words * 330)
        tick()
        return
      }
      const synth = window.speechSynthesis
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const v = this.pickBrowserVoice(persona, slot)
      if (v) {
        u.voice = v
        u.lang = v.lang
      }
      u.pitch = persona.voice?.pitch ?? 1
      u.rate = persona.voice?.rate ?? 1
      u.onend = () => {
        clearTimeout(timer)
        settle()
      }
      u.onerror = () => {
        clearTimeout(timer)
        settle()
      }
      timer = setTimeout(() => finish(true), 5000 + words * 650)
      synth.speak(u)
      tick()
    })
  }
}
