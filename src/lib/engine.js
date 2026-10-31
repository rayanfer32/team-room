import { complete } from './llm'
import { VoicePlayer } from './tts'
import { kokoro } from './kokoro'
import { buildPrompt } from './prompts'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const abortError = () => new DOMException('Aborted', 'AbortError')

export const findManager = (personas) => personas.find((p) => /manager|lead|scrum|head/i.test(p.role)) || personas[0]

/** People are identified by their names, so names must be present and unique. */
export function teamProblem(personas) {
  const seen = new Set()
  for (const p of personas) {
    const n = p.name.trim()
    if (!n) return 'Every person needs a name.'
    if (n.toLowerCase() === 'you') return '"You" is reserved for you, so pick another name.'
    if (seen.has(n.toLowerCase())) return `Two people are called ${n}. Names must be unique, because they identify each person.`
    seen.add(n.toLowerCase())
  }
  return null
}

/** The person who opens, closes and (in mediator mode) moderates the meeting. */
export function hostOf(settings) {
  const name = settings.conversation?.mediator
  return settings.personas.find((p) => p.name === name) || findManager(settings.personas)
}

export function voiceSlot(personas, persona) {
  const same = personas.filter((p) => p.gender === persona.gender)
  return Math.max(0, same.findIndex((p) => p.name === persona.name))
}

/* ---------------- parsing ---------------- */

const STAGE = /\((?:chuckles|laughs|laughing|sighs|smiles|smiling|pauses|nods|grins|clears throat)[^)]*\)|\*[^*]{1,30}\*/gi
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Keep a line to a few spoken sentences, even if the model rambles. */
function trimSpeech(text, maxWords = 75) {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [text]
  let out = ''
  for (const s of sentences) {
    const next = `${out} ${s.trim()}`.trim()
    if (out && next.split(/\s+/).length > maxWords) break
    out = next
  }
  return out
}

function resolvePersona(raw, personas) {
  const s = String(raw || '').toLowerCase().replace(/[*"]/g, '').trim()
  if (!s) return null
  return (
    personas.find((p) => p.name.toLowerCase() === s) ||
    personas.find((p) => s.includes(p.name.toLowerCase())) ||
    personas.find((p) => p.name.toLowerCase().split(/\s+/)[0] === s.split(/\s+/)[0]) ||
    personas.find((p) => p.role.toLowerCase() === s) ||
    null
  )
}

function cleanText(text, personas) {
  let t = String(text || '').trim()
  for (const p of personas) t = t.replace(new RegExp(`^${esc(p.name)}\\s*(\\([^)]*\\))?\\s*:\\s*`, 'i'), '')
  t = t
    .replace(STAGE, '')
    .replace(/<[^>]*>/g, '')
    .replace(/^["'“]+|["'”]+$/g, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  t = trimSpeech(t)
  return t.split(/\s+/).length < 3 ? '' : t
}

function jsonItems(raw) {
  const tryParse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      try {
        return JSON.parse(s.replace(/[\u201c\u201d]/g, '"'))
      } catch {
        return undefined
      }
    }
  }
  const m = raw.match(/[[{][\s\S]*[\]}]/)
  if (m) {
    const v = tryParse(m[0])
    if (Array.isArray(v)) return v
    if (v && Array.isArray(v.lines)) return v.lines
    if (v && (v.speaker || v.text)) return [v]
  }
  // Truncated or malformed JSON: rescue each complete {"speaker":…,"text":…} object.
  const parts = raw.match(/\{[^{}]*"speaker"[^{}]*\}/g)
  if (parts) return parts.map(tryParse).filter(Boolean)
  return null
}

/**
 * Turn whatever the model sent into spoken lines. Handles JSON (one line or many),
 * "Name: line" scripts, and plain speech from small models that ignore the format.
 */
export function parseLines(raw, personas, lastSpeaker) {
  const out = []
  let last = lastSpeaker
  const push = (who, text) => {
    const t = cleanText(text, personas)
    if (!t || /^\s*[{[]/.test(t)) return
    let persona = resolvePersona(who, personas)
    if (!persona) {
      const others = personas.filter((p) => p.name !== last)
      persona = others[Math.floor(Math.random() * others.length)]
    }
    out.push({ persona, text: t })
    last = persona.name
  }

  const items = jsonItems(raw)
  if (items) items.forEach((it) => it && push(it.speaker ?? it.name, it.text ?? it.line ?? it.message))
  if (out.length) return out

  const body = raw.replace(/^\s*(here'?s|sure|okay|ok)[^\n:]*:\s*/i, '')
  const names = personas.map((p) => esc(p.name)).join('|')
  const re = new RegExp(`^\\s*\\**(${names})\\**\\s*(?:\\([^)]*\\))?\\s*:\\s*`, 'gim')
  const marks = [...body.matchAll(re)]
  if (marks.length) {
    marks.forEach((m, i) => push(m[1], body.slice(m.index + m[0].length, marks[i + 1]?.index ?? body.length)))
  } else {
    push('', body)
  }
  return out
}

/* ---------------- engine ---------------- */

export class MeetingEngine {
  constructor({ getSettings, live }) {
    this.getSettings = getSettings
    this.live = live
    this.player = new VoicePlayer(live)
    this.state = { status: 'idle', topic: '', transcript: [], speaking: null, thinking: false, error: null, note: null, calls: 0, queued: 0 }
    this.listeners = new Set()
    this.epoch = 0
    this.controllers = new Set()
    this.next = null
    this.queue = []
    this.looping = false
    this.stepRequested = false
    this.lineId = 0
  }

  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  set(patch) {
    this.state = { ...this.state, ...patch }
    this.live.speaking = this.state.speaking
    this.listeners.forEach((f) => f())
  }

  start(topic) {
    this._cancelPending()
    this.player.stop()
    this.player.unlock()
    this.player.resetFailures()
    const s = this.getSettings()
    if (s.tts.provider === 'kokoro') kokoro.preload(s.tts.kokoroDevice)
    this.set({ status: 'running', topic: topic.trim(), transcript: [], speaking: null, thinking: false, error: null, note: null, calls: 0, queued: 0 })
    this._run()
  }

  pause() {
    if (this.state.status === 'running') this.set({ status: 'paused' })
  }

  resume() {
    if (this.state.status !== 'paused') return
    this.player.unlock()
    this.set({ status: 'running', error: null })
    this._run()
  }

  step() {
    if (this.state.status !== 'paused') return
    this.player.unlock()
    this.set({ error: null })
    this.stepRequested = true
    this._run()
  }

  end() {
    this._cancelPending()
    this.player.stop()
    this.set({ status: 'ended', speaking: null, thinking: false })
  }

  /** The human speaks: everyone stops, pre-written lines are dropped, and the next line responds to them. */
  interject(raw) {
    const text = raw.trim()
    if (!text || this.state.status === 'idle') return
    this._cancelPending()
    this.player.stop()
    this.player.unlock()
    const wasRunning = this.state.status === 'running'
    const line = { id: ++this.lineId, you: true, speaker: null, name: 'You', role: 'Stakeholder', text }
    this.set({
      transcript: [...this.state.transcript, line],
      speaking: null,
      error: null,
      status: wasRunning ? 'running' : 'paused',
    })
    if (!wasRunning) this.stepRequested = true
    this._run()
  }

  async testVoice(persona) {
    if (this.state.status === 'running') return
    this.player.unlock()
    const s = this.getSettings()
    const text = `Hi, I'm ${persona.name}, the ${persona.role.toLowerCase()} on this team.`
    this.player.stop()
    this.live.speaking = persona.name
    try {
      const audio = await this.player.fetchAudio(text, persona, s.tts, { wait: true, onNote: (note) => this.set({ note }) })
      await this.player.play(audio, text, persona, voiceSlot(s.personas, persona))
    } finally {
      this.live.speaking = this.state.speaking
    }
  }

  _cancelPending() {
    this.epoch++
    this.controllers.forEach((c) => c.abort())
    this.controllers.clear()
    this.next = null
    this.queue = []
    if (this.state.queued) this.set({ queued: 0 })
  }

  async _run() {
    if (this.looping) return
    this.looping = true
    try {
      while (this.state.status === 'running' || this.stepRequested) {
        this.stepRequested = false
        const epoch = this.epoch
        const pending = this.next && this.next.epoch === epoch ? this.next.promise : this._prepare(epoch)
        this.next = null
        this.set({ thinking: true })

        let turn
        try {
          turn = await pending
        } catch (e) {
          if (epoch !== this.epoch || e.name === 'AbortError') continue
          this.set({ thinking: false, status: 'paused', error: e.message || String(e) })
          break
        }
        if (epoch !== this.epoch) continue

        const line = { id: ++this.lineId, you: false, speaker: turn.persona.name, name: turn.persona.name, role: turn.persona.role, text: turn.text }
        this.set({ thinking: false, transcript: [...this.state.transcript, line], speaking: line.speaker })

        // Prepare the next line (and its audio) while this one is spoken.
        if (!turn.final && this.state.status === 'running') {
          const p = this._prepare(epoch)
          p.catch(() => {})
          this.next = { epoch, promise: p }
        }

        await this.player.play(turn.audio, turn.text, turn.persona, turn.slot)
        if (epoch !== this.epoch) continue
        this.set({ speaking: null })
        if (turn.final) {
          this.next = null
          this.set({ status: 'ended' })
          break
        }
        await sleep(350)
      }
    } finally {
      this.looping = false
      if (this.state.thinking) this.set({ thinking: false })
    }
  }

  /** Next spoken turn: from the queue if lines were written ahead, otherwise from a new API call. */
  async _prepare(epoch) {
    const s = this.getSettings()
    const ctrl = new AbortController()
    this.controllers.add(ctrl)
    try {
      while (!this.queue.length) {
        await this._writeLines(s, ctrl.signal, epoch)
        if (epoch !== this.epoch) throw abortError()
      }
      const turn = this.queue.shift()
      this.set({ queued: this.queue.length })
      // The team may have been edited since these lines were written.
      const persona = s.personas.find((p) => p.name === turn.persona.name) || turn.persona
      const audio =
        epoch === this.epoch
          ? await this.player.fetchAudio(turn.text, persona, s.tts, {
              signal: ctrl.signal,
              onNote: (note) => this.state.note !== note && this.set({ note }),
            })
          : null
      return { ...turn, persona, audio, slot: voiceSlot(s.personas, persona) }
    } finally {
      this.controllers.delete(ctrl)
    }
  }

  /** One API call that writes 1…batchSize lines into the queue. */
  async _writeLines(s, signal, epoch) {
    const { personas, maxTurns } = s
    const conv = { mode: 'freeflow', batchSize: 1, ...s.conversation }
    const host = hostOf(s)
    const transcript = this.state.transcript
    const spoken = transcript.filter((l) => !l.you).length
    const count = Math.max(1, Math.min(conv.batchSize, maxTurns - spoken))
    const userLast = !!transcript.at(-1)?.you
    const endsHere = spoken + count >= maxTurns
    const firstRef = count === 1 ? 'This line' : 'Line 1'

    let forcedFirst = null
    const phases = []
    if (spoken === 0) {
      forcedFirst = host.name
      phases.push({ key: 'opening', lineRef: firstRef })
    } else if (userLast) {
      phases.push({ key: 'replyToYou', lineRef: firstRef })
    } else if (conv.mode === 'mediator' && count === 1) {
      const recent = transcript.slice(-2)
      if (recent.length === 2 && recent.every((l) => !l.you && l.speaker !== host.name)) {
        forcedFirst = host.name
        phases.push({ key: 'mediatorNudge', lineRef: firstRef })
      }
    }
    if (endsHere) phases.push({ key: 'closing', lineRef: count === 1 ? 'This line' : `Line ${count}` })
    else if (spoken + count >= maxTurns - 4) phases.push({ key: 'converge' })
    else if (!phases.length) phases.push({ key: 'keepGoing' })

    const { system, prompt } = buildPrompt({ prompts: s.prompts, personas, topic: this.state.topic, transcript, phases, mode: conv.mode, host, count })
    let lines = []
    let lastErr = null
    for (let attempt = 0; attempt < 2 && !lines.length; attempt++) {
      const raw = await complete({
        provider: s.llm.provider,
        apiKey: s.llm.keys[s.llm.provider],
        model: s.llm.models[s.llm.provider],
        system,
        prompt,
        signal,
        maxTokens: 250 + count * 150,
      })
      this.set({ calls: this.state.calls + 1 })
      lines = parseLines(raw, personas, transcript.at(-1)?.speaker)
      if (!lines.length) lastErr = new Error('The model sent a reply the meeting could not read. Press Next line to retry, or try another model.')
    }
    if (!lines.length) throw lastErr

    lines = lines.slice(0, count).map((l) => ({ ...l, final: false }))
    if (forcedFirst) lines[0].persona = personas.find((p) => p.name === forcedFirst) || lines[0].persona
    if (spoken + lines.length >= maxTurns) {
      const last = lines.at(-1)
      last.final = true
      last.persona = host
    }
    if (epoch !== this.epoch) return // interrupted while writing: these lines are stale
    this.queue.push(...lines)
    this.set({ queued: this.queue.length })
  }
}
