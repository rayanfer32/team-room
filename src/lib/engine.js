import { complete } from './llm'
import { VoicePlayer } from './tts'
import { kokoro } from './kokoro'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const findManager = (personas) => personas.find((p) => /manager|lead|scrum/i.test(p.role)) || personas[0]

export function voiceSlot(personas, persona) {
  const same = personas.filter((p) => p.gender === persona.gender)
  return Math.max(0, same.findIndex((p) => p.id === persona.id))
}

function buildPrompt({ personas, topic, transcript, phase }) {
  const team = personas.map((p) => `- id "${p.id}": ${p.name}, ${p.role}. ${p.traits}`).join('\n')
  const system = `You write a live, realistic team meeting between five colleagues sitting around a table in a cozy office. Each reply voices exactly ONE person.

The team:
${team}

Meeting topic: "${topic}"

Choosing who speaks next: follow natural meeting flow. Pick whoever was just addressed or asked a question, whoever's expertise matters most for the point on the table, or whoever would genuinely react. Do not pick the person who spoke last unless they were asked something directly. Across the meeting everyone should contribute.

How they talk:
- 1 to 3 short spoken sentences, under 55 words. This is read aloud: no markdown, lists, emojis, stage directions or name prefixes.
- Stay in character and use colleagues' names now and then. Move the discussion forward: raise concrete risks, propose specific ideas, ask pointed questions, disagree respectfully, reach decisions.
- Be concrete about the topic, like people who actually build this product. Don't repeat points already made.
- "You" is a human stakeholder who joined the meeting. When You has just spoken, the most relevant person answers You directly.

Reply with only a JSON object and nothing else: {"speaker":"<id>","text":"<spoken words>"}`

  const lines = transcript
    .slice(-26)
    .map((l) => `${l.name} (${l.role}): ${l.text}`)
    .join('\n')
  const prompt = `${lines ? `Transcript so far:\n${lines}` : 'The meeting is just starting. Nobody has spoken yet.'}

${phase}

Who speaks next, and what do they say? JSON only.`
  return { system, prompt }
}

const STAGE = /\((?:chuckles|laughs|laughing|sighs|smiles|smiling|pauses|nods|grins|clears throat)[^)]*\)|\*[^*]{1,30}\*/gi

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

export function parseTurn(raw, personas, lastSpeakerId) {
  let obj = null
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      obj = JSON.parse(m[0])
    } catch {
      try {
        obj = JSON.parse(m[0].replace(/[\u201c\u201d]/g, '"'))
      } catch {
        obj = null
      }
    }
  }
  let speaker = ''
  let text = ''
  if (obj) {
    speaker = String(obj.speaker ?? obj.id ?? obj.name ?? '').toLowerCase().trim()
    text = String(obj.text ?? obj.line ?? obj.message ?? '')
  } else {
    const cleaned = raw.replace(/^\s*(here'?s|sure|okay|ok)[^\n:]*:\s*/i, '')
    const mm = cleaned.match(/^\s*\**([A-Za-z]+)\**\s*(?:\([^)]*\))?\s*:\s*([\s\S]+)/)
    if (mm && personas.some((p) => p.name.toLowerCase() === mm[1].toLowerCase() || p.id === mm[1].toLowerCase())) {
      speaker = mm[1].toLowerCase()
      text = mm[2]
    } else {
      text = cleaned // plain speech with no speaker: we'll pick one below
    }
    // If the model wrote a whole script, keep only the first person's line.
    text = text.split(/\n\s*\**[A-Z][a-z]+\**\s*(?:\([^)]*\))?\s*:/)[0]
  }
  let persona =
    personas.find((p) => p.id === speaker) ||
    personas.find((p) => p.name.toLowerCase() === speaker) ||
    personas.find((p) => speaker && (speaker.includes(p.name.toLowerCase()) || speaker.includes(p.id)))
  text = text.trim()
  for (const p of personas) {
    const prefix = new RegExp(`^${p.name}\\s*(\\([^)]*\\))?\\s*:\\s*`, 'i')
    text = text.replace(prefix, '')
  }
  text = text.replace(STAGE, '').replace(/^["'“]+|["'”]+$/g, '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim()
  text = trimSpeech(text)
  text = text.replace(/<[^>]*>/g, '').trim()
  if (text.split(/\s+/).length < 3) text = ''
  if (!persona && text && !/^\s*[{[]/.test(text)) {
    const others = personas.filter((p) => p.id !== lastSpeakerId)
    persona = others[Math.floor(Math.random() * others.length)]
  }
  if (!persona || !text) throw new Error('The model sent a reply the meeting could not read. Press Next line to retry, or try another model.')
  return { persona, text }
}

export class MeetingEngine {
  constructor({ getSettings, live }) {
    this.getSettings = getSettings
    this.live = live
    this.player = new VoicePlayer(live)
    this.state = { status: 'idle', topic: '', transcript: [], speakingId: null, thinking: false, error: null, note: null }
    this.listeners = new Set()
    this.epoch = 0
    this.controllers = new Set()
    this.next = null
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
    this.set({ status: 'running', topic: topic.trim(), transcript: [], speakingId: null, thinking: false, error: null, note: null })
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

  /** The human speaks: everyone stops, and the next line responds to them. */
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

        // Write the next line while this one is being spoken, so the talk flows.
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

  async _prepare(epoch) {
    const s = this.getSettings()
    const ctrl = new AbortController()
    this.controllers.add(ctrl)
    try {
      const { personas, maxTurns } = s
      const transcript = this.state.transcript
      const teamTurns = transcript.filter((l) => l.speaker !== 'you').length
      const manager = findManager(personas)
      let phase = 'Keep the discussion moving naturally.'
      let forced = null
      let final = false
      if (teamTurns === 0) {
        forced = manager.id
        phase = `${manager.name} (${manager.role}) opens the meeting with a quick hello, the topic, and what the team needs to decide today.`
      } else if (teamTurns >= maxTurns - 1) {
        forced = manager.id
        final = true
        phase = `This is the final line of the meeting, spoken by ${manager.name}. Wrap up: the decisions made, who owns which next step, then thank everyone. Up to 4 sentences.`
      } else if (teamTurns >= maxTurns - 5) {
        phase = 'Time is almost up. Start converging: settle open questions and agree on decisions, owners and next steps.'
      }
      if (transcript.at(-1)?.speaker === 'you' && !final) {
        forced = null
        phase = 'You (the stakeholder) just spoke. The most relevant person responds directly to what You said.'
      }

      const { system, prompt } = buildPrompt({ personas, topic: this.state.topic, transcript, phase })
      let parsed = null
      let lastErr = null
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const raw = await complete({
          provider: s.llm.provider,
          apiKey: s.llm.keys[s.llm.provider],
          model: s.llm.models[s.llm.provider],
          system,
          prompt,
          signal: ctrl.signal,
        })
        try {
          parsed = parseTurn(raw, personas, transcript.at(-1)?.speaker)
        } catch (e) {
          lastErr = e
        }
      }
      if (!parsed) throw lastErr
      if (forced) parsed.persona = personas.find((p) => p.id === forced) || parsed.persona

      const audio =
        epoch === this.epoch
          ? await this.player.fetchAudio(parsed.text, parsed.persona, s.tts, {
              signal: ctrl.signal,
              onNote: (note) => this.state.note !== note && this.set({ note }),
            })
          : null
      return { ...parsed, final, audio, slot: voiceSlot(personas, parsed.persona) }
    } finally {
      this.controllers.delete(ctrl)
    }
  }
}
