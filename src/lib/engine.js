import { complete } from './llm'
import { VoicePlayer } from './tts'
import { kokoro } from './kokoro'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const abortError = () => new DOMException('Aborted', 'AbortError')

export const findManager = (personas) => personas.find((p) => /manager|lead|scrum|head/i.test(p.role)) || personas[0]

/** The person who opens, closes and (in mediator mode) moderates the meeting. */
export function hostOf(settings) {
  const id = settings.conversation?.mediatorId
  return settings.personas.find((p) => p.id === id) || findManager(settings.personas)
}

export function voiceSlot(personas, persona) {
  const same = personas.filter((p) => p.gender === persona.gender)
  return Math.max(0, same.findIndex((p) => p.id === persona.id))
}

/* ---------------- prompting ---------------- */

function buildPrompt({ personas, topic, transcript, phases, mode, host, count }) {
  const team = personas.map((p) => `- id "${p.id}": ${p.name}, ${p.role}. ${p.traits}`).join('\n')
  const flow =
    mode === 'mediator'
      ? `Format: a moderated meeting. ${host.name} is the mediator. ${host.name} frames each question, invites a specific colleague by name, and after one or two answers summarises briefly or moves to the next point, making sure everyone is heard. Others speak only when invited, or to respond directly to the person who just spoke. ${host.name} speaks about every second or third line.`
      : `Format: a free-flowing discussion. Anyone can jump in. Pick who speaks next by natural meeting flow: whoever was just addressed or asked a question, whoever's expertise matters most for the point on the table, or whoever would genuinely react. Don't pick the person who spoke last unless they were asked something directly. Over the meeting everyone should contribute.`
  const format =
    count === 1
      ? 'Reply with only a JSON object and nothing else: {"speaker":"<id>","text":"<spoken words>"}'
      : `Reply with only a JSON object and nothing else: {"lines":[{"speaker":"<id>","text":"<spoken words>"}, ...]} with exactly ${count} lines in speaking order. Consecutive lines should come from different people.`

  const system = `You write a live, realistic meeting between ${personas.length} colleagues sitting around a table in a cozy office. Each line is spoken by exactly ONE person.

The team:
${team}

Meeting topic: "${topic}"

${flow}

How they talk:
- Each line is 1 to 3 short spoken sentences, under 55 words. It is read aloud: no markdown, lists, emojis, stage directions or name prefixes.
- Stay in character and use colleagues' names now and then. Move the discussion forward: raise concrete risks, propose specific ideas, ask pointed questions, disagree respectfully, reach decisions.
- Be concrete about the topic, like people who actually build this product. Don't repeat points already made.
- "You" is a human stakeholder who joined the meeting. When You has just spoken, the most relevant person answers You directly.

${format}`

  const lines = transcript
    .slice(-26)
    .map((l) => `${l.name} (${l.role}): ${l.text}`)
    .join('\n')
  const ask = count === 1 ? 'Who speaks next, and what do they say? JSON only.' : `Write the next ${count} lines of the meeting. JSON only.`
  const prompt = `${lines ? `Transcript so far:\n${lines}` : 'The meeting is just starting. Nobody has spoken yet.'}

${phases.join('\n')}

${ask}`
  return { system, prompt }
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
    personas.find((p) => p.id === s) ||
    personas.find((p) => p.name.toLowerCase() === s) ||
    personas.find((p) => s.includes(p.name.toLowerCase()) || s.includes(p.id)) ||
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
export function parseLines(raw, personas, lastSpeakerId) {
  const out = []
  let last = lastSpeakerId
  const push = (who, text) => {
    const t = cleanText(text, personas)
    if (!t || /^\s*[{[]/.test(t)) return
    let persona = resolvePersona(who, personas)
    if (!persona) {
      const others = personas.filter((p) => p.id !== last)
      persona = others[Math.floor(Math.random() * others.length)]
    }
    out.push({ persona, text: t })
    last = persona.id
  }

  const items = jsonItems(raw)
  if (items) items.forEach((it) => it && push(it.speaker ?? it.id ?? it.name, it.text ?? it.line ?? it.message))
  if (out.length) return out

  const body = raw.replace(/^\s*(here'?s|sure|okay|ok)[^\n:]*:\s*/i, '')
  const names = personas.flatMap((p) => [esc(p.name), esc(p.id)]).join('|')
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
    this.state = { status: 'idle', topic: '', transcript: [], speakingId: null, thinking: false, error: null, note: null, calls: 0, queued: 0 }
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
    this.live.speakingId = this.state.speakingId
    this.listeners.forEach((f) => f())
  }

  start(topic) {
    this._cancelPending()
    this.player.stop()
    this.player.unlock()
    this.player.resetFailures()
    const s = this.getSettings()
    if (s.tts.provider === 'kokoro') kokoro.preload(s.tts.kokoroDevice)
    this.set({ status: 'running', topic: topic.trim(), transcript: [], speakingId: null, thinking: false, error: null, note: null, calls: 0, queued: 0 })
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
    this.set({ status: 'ended', speakingId: null, thinking: false })
  }

  /** The human speaks: everyone stops, pre-written lines are dropped, and the next line responds to them. */
  interject(raw) {
    const text = raw.trim()
    if (!text || this.state.status === 'idle') return
    this._cancelPending()
    this.player.stop()
    this.player.unlock()
    const wasRunning = this.state.status === 'running'
    const line = { id: ++this.lineId, speaker: 'you', name: 'You', role: 'Stakeholder', text }
    this.set({
      transcript: [...this.state.transcript, line],
      speakingId: null,
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
    this.live.speakingId = persona.id
    try {
      const audio = await this.player.fetchAudio(text, persona, s.tts, { wait: true, onNote: (note) => this.set({ note }) })
      await this.player.play(audio, text, persona, voiceSlot(s.personas, persona))
    } finally {
      this.live.speakingId = this.state.speakingId
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

        const line = { id: ++this.lineId, speaker: turn.persona.id, name: turn.persona.name, role: turn.persona.role, text: turn.text }
        this.set({ thinking: false, transcript: [...this.state.transcript, line], speakingId: line.speaker })

        // Prepare the next line (and its audio) while this one is spoken.
        if (!turn.final && this.state.status === 'running') {
          const p = this._prepare(epoch)
          p.catch(() => {})
          this.next = { epoch, promise: p }
        }

        await this.player.play(turn.audio, turn.text, turn.persona, turn.slot)
        if (epoch !== this.epoch) continue
        this.set({ speakingId: null })
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
      const persona = s.personas.find((p) => p.id === turn.persona.id) || turn.persona
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
    const spoken = transcript.filter((l) => l.speaker !== 'you').length
    const count = Math.max(1, Math.min(conv.batchSize, maxTurns - spoken))
    const userLast = transcript.at(-1)?.speaker === 'you'
    const endsHere = spoken + count >= maxTurns

    let forcedFirst = null
    const phases = []
    if (spoken === 0) {
      forcedFirst = host.id
      phases.push(`${count === 1 ? 'This line' : 'Line 1'} is ${host.name} (${host.role}) opening the meeting: a quick hello, the topic, and what the team needs to decide today.`)
    } else if (userLast) {
      phases.push(`You (the stakeholder) just spoke. ${count === 1 ? 'This line' : 'Line 1'} answers You directly, from the most relevant person.`)
    } else if (conv.mode === 'mediator' && count === 1) {
      const recent = transcript.slice(-2)
      if (recent.length === 2 && recent.every((l) => l.speaker !== host.id && l.speaker !== 'you')) {
        forcedFirst = host.id
        phases.push(`This line is ${host.name}, the mediator, reacting briefly and inviting the next person or moving to the next point.`)
      }
    }
    if (endsHere) {
      phases.push(
        `${count === 1 ? 'This is the final line of the meeting' : `The meeting ends with line ${count}`}, spoken by ${host.name}: the decisions made, who owns which next step, then thanks to everyone. Up to 4 sentences.${count > 1 ? ' The lines before it converge toward those decisions.' : ''}`,
      )
    } else if (spoken + count >= maxTurns - 4) {
      phases.push('Time is almost up. Start converging: settle open questions and agree on decisions, owners and next steps.')
    } else if (!phases.length) {
      phases.push('Keep the discussion moving naturally.')
    }

    const { system, prompt } = buildPrompt({ personas, topic: this.state.topic, transcript, phases, mode: conv.mode, host, count })
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
    if (forcedFirst) lines[0].persona = personas.find((p) => p.id === forcedFirst) || lines[0].persona
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
