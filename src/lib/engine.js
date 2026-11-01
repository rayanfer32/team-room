import { complete, LLM_PROVIDERS } from './llm'
import { VoicePlayer } from './tts'
import { kokoro } from './kokoro'
import {
  buildAgentPrompt,
  buildBoardSummaryPrompt,
  buildDirectorPrompt,
  buildInterviewPrompt,
  buildPlanPrompt,
  buildPrompt,
  buildScorePrompt,
} from './prompts'
import { cleanText, parseJson, parseLines, resolvePersona } from './parse'
import { boardText, emptyBoard, mergeBoard, parseBoardField, parseBoardSummary } from './board'
import { agendaItems, agendaPosition, agendaTurns } from './agenda'
import { boardAt, saveSession } from './library'
import { TraceStore } from './trace'
import { buildToolSet, builtinPlan, policyOf } from './tools'
import { callTool, resultText } from './mcp'
import { refreshOAuth } from './oauth'
import { DEFAULT_PROMPTS, fill } from './prompts'

export { parseLines } from './parse'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const abortError = () => new DOMException('Aborted', 'AbortError')
const clone = (o) => JSON.parse(JSON.stringify(o))
const shuffle = (list) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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

/** Who is at the table for this kind of session. */
export const castOf = (settings, kind) => (kind === 'interview' ? settings.interview.panel : settings.personas)

/** The person who opens, closes and (in mediator modes) moderates. */
export function hostOf(settings, kind = settings.session?.kind) {
  if (kind === 'interview') return findManager(settings.interview.panel)
  const name = settings.conversation?.mediator
  return settings.personas.find((p) => p.name === name) || findManager(settings.personas)
}

export function voiceSlot(personas, persona) {
  const same = personas.filter((p) => p.gender === persona.gender)
  return Math.max(0, same.findIndex((p) => p.name === persona.name))
}

const AGENT_PHASE = { opening: 'agentOpening', replyToYou: 'agentReplyToYou', closing: 'agentClosing' }

const IDLE = {
  status: 'idle', // idle | running | paused | awaiting | replaying | replayPaused | ended
  kind: 'meeting',
  topic: '',
  role: '',
  transcript: [],
  speaking: null,
  focus: null,
  thinking: false,
  scoring: false,
  error: null,
  note: null,
  calls: 0,
  queued: 0,
  maxTurns: 0,
  board: emptyBoard(),
  agenda: null, // { items, index }
  interview: null, // { total, asked }
  scorecard: null,
  savedId: null,
  replay: null, // { index, total, title }
  approvals: [], // tool calls waiting for your OK
  toolActivity: null, // { persona, server, tool } while a tool runs
  cast: null, // people shown during a replay
}

export class MeetingEngine {
  constructor({ getSettings, live }) {
    this.getSettings = getSettings
    this.live = live
    this.player = new VoicePlayer(live)
    this.state = { ...IDLE }
    this.listeners = new Set()
    this.epoch = 0
    this.controllers = new Set()
    this.next = null
    this.queue = []
    this.looping = false
    this.stepRequested = false
    this.lineId = 0
    this.boardHistory = []
    this.notes = {} // agent name → private notes
    this.invited = null // mediator agent's pick for the next speaker
    this.iv = null // interview progress
    this.summarizing = false
    this.traces = new TraceStore()
    this.approvalSeq = 0
    this.pending = new Map() // approval id → resolve
    // Set by the app so the engine can save changes to settings.
    this.setToolPolicy = null // (serverId, toolName, policy)
    this.updateServer = null // (serverId, patch)
  }

  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  set(patch) {
    this.state = { ...this.state, ...patch }
    this.live.speaking = this.state.speaking
    this.live.focus = this.state.focus
    this.listeners.forEach((f) => f())
  }

  /* ================= public controls ================= */

  start(topic) {
    const s = this.getSettings()
    this._reset()
    if (s.tts.provider === 'kokoro') kokoro.preload(s.tts.kokoroDevice)
    const items = agendaItems(s.session.agenda)
    this.set({
      ...IDLE,
      status: 'running',
      kind: 'meeting',
      topic: topic.trim(),
      maxTurns: agendaTurns(s.session.agenda) || s.maxTurns,
      agenda: items.length ? { items, index: -1 } : null,
      board: emptyBoard(),
    })
    this._run()
  }

  async startInterview() {
    const s = this.getSettings()
    const cfg = s.interview
    this._reset()
    if (s.tts.provider === 'kokoro') kokoro.preload(s.tts.kokoroDevice)
    const role = cfg.role.trim()
    this.set({ ...IDLE, status: 'running', kind: 'interview', topic: role, role, thinking: true, board: emptyBoard() })
    const epoch = this.epoch
    try {
      const plan = await this._planInterview(s, epoch)
      if (epoch !== this.epoch) return
      const panel = castOf(s, 'interview')
      const host = hostOf(s, 'interview')
      const others = panel.filter((p) => p.name !== host.name)
      const askers = others.length ? others : panel
      this.iv = {
        plan: plan.map((q, i) => ({ ...q, asker: askers[i % askers.length].name })),
        index: 0,
        followupsLeft: 0,
        current: null,
        introDone: false,
        closed: false,
      }
      this.set({ thinking: false, maxTurns: plan.length, interview: { total: plan.length, asked: 0, questions: plan.map((q) => q.question) } })
      this._run()
    } catch (e) {
      if (epoch !== this.epoch || e.name === 'AbortError') return
      this.set({ thinking: false, status: 'ended', error: e.message || String(e) })
    }
  }

  pause() {
    if (this.state.status === 'running') this.set({ status: 'paused' })
    else if (this.state.status === 'replaying') {
      this.epoch++
      this.player.stop()
      this.set({ status: 'replayPaused', speaking: null })
    }
  }

  resume() {
    this.player.unlock()
    if (this.state.status === 'paused') {
      this.set({ status: 'running', error: null })
      this._run()
    } else if (this.state.status === 'replayPaused') {
      this.set({ status: 'replaying' })
      this._runReplay()
    }
  }

  step() {
    if (this.state.status !== 'paused') return
    this.player.unlock()
    this.set({ error: null })
    this.stepRequested = true
    this._run()
  }

  end() {
    if (this.state.status === 'replaying' || this.state.status === 'replayPaused') return this.stopReplay()
    this._cancelPending()
    this.player.stop()
    const wasLive = ['running', 'paused', 'awaiting'].includes(this.state.status)
    this.set({ status: 'ended', speaking: null, focus: null, thinking: false })
    if (wasLive) this._finish()
  }

  /** You speak. In a meeting everyone stops and responds; in an interview this is your answer. */
  interject(raw, { skipped = false } = {}) {
    const text = raw.trim()
    const { status, kind } = this.state
    if (!text || !['running', 'paused', 'awaiting', 'ended'].includes(status)) return
    if (kind === 'interview' && status === 'ended') return
    this._cancelPending()
    this.player.stop()
    this.player.unlock()
    const line = { id: ++this.lineId, you: true, skipped, speaker: null, name: 'You', role: kind === 'interview' ? 'Candidate' : 'Stakeholder', text }
    const resume = status === 'running' || status === 'awaiting' || kind === 'interview'
    this.set({ transcript: [...this.state.transcript, line], speaking: null, focus: null, error: null, status: resume ? 'running' : 'paused' })
    if (!resume) this.stepRequested = true
    this._run()
  }

  skipQuestion() {
    if (this.state.kind === 'interview') this.interject('(Skipped this question.)', { skipped: true })
  }

  /** Save to the library (text only). Updates the same entry if saved before. */
  save() {
    if (!this.state.transcript.length) return null
    const s = this.getSettings()
    const cast = this.state.cast || castOf(s, this.state.kind)
    const id = saveSession({
      id: this.state.savedId || undefined,
      kind: this.state.kind,
      title: this.state.kind === 'interview' ? `Interview: ${this.state.role}` : this.state.topic,
      topic: this.state.topic,
      role: this.state.role,
      personas: clone(cast),
      transcript: this.state.transcript,
      board: this.state.board,
      boardHistory: this.boardHistory,
      agenda: this.state.agenda?.items || null,
      interview: this.state.interview,
      scorecard: this.state.scorecard,
      engine: this.state.kind === 'interview' ? 'interview' : s.conversation.engine,
    })
    if (id) this.set({ savedId: id })
    else this.set({ note: "Couldn't save: this browser's storage is full. Delete some saved meetings first." })
    return id
  }

  startReplay(session) {
    this._reset()
    this.replaySession = session
    this.set({
      ...IDLE,
      status: 'replaying',
      kind: session.kind,
      topic: session.topic,
      role: session.role || '',
      cast: session.personas,
      agenda: session.agenda ? { items: session.agenda, index: -1 } : null,
      interview: session.interview || null,
      scorecard: session.scorecard || null,
      savedId: session.id,
      maxTurns: session.transcript.filter((l) => !l.you).length,
      replay: { index: 0, total: session.transcript.length, title: session.title },
    })
    this._runReplay()
  }

  /** Jump back or forward by whole lines during a replay. */
  replaySeek(delta) {
    const r = this.state.replay
    if (!r) return
    const playing = this.state.status === 'replaying'
    this.epoch++
    this.player.stop()
    const current = playing ? r.index - 1 : r.index
    const index = Math.max(0, Math.min(r.total - 1, current + delta))
    this._showReplayUpTo(index)
    this.set({ replay: { ...r, index }, speaking: null })
    if (playing) this._runReplay()
  }

  stopReplay() {
    this.epoch++
    this.player.stop()
    const session = this.replaySession
    if (session) this._showReplayUpTo(session.transcript.length - 1)
    this.set({ status: 'ended', speaking: null, focus: null, replay: null })
  }

  async testVoice(persona) {
    if (['running', 'replaying'].includes(this.state.status)) return
    this.player.unlock()
    const s = this.getSettings()
    const text = `Hi, I'm ${persona.name}, the ${persona.role.toLowerCase()}.`
    this.player.stop()
    this.live.speaking = persona.name
    try {
      const audio = await this.player.fetchAudio(text, persona, s.tts, { wait: true, onNote: (note) => this.set({ note }) })
      await this.player.play(audio, text, persona, voiceSlot(castOf(s, this.state.kind), persona))
    } finally {
      this.live.speaking = this.state.speaking
    }
  }

  /** Your answer to a tool call waiting for approval: 'once' | 'always' | 'deny'. */
  resolveApproval(id, decision) {
    const resolve = this.pending.get(id)
    if (!resolve) return
    this.pending.delete(id)
    this.set({ approvals: this.state.approvals.filter((a) => a.id !== id) })
    resolve(decision)
  }

  /* ================= internals ================= */

  _reset() {
    this.traces.clear()
    this._cancelPending()
    this.player.stop()
    this.player.unlock()
    this.player.resetFailures()
    this.boardHistory = []
    this.notes = {}
    this.invited = null
    this.iv = null
    this.replaySession = null
  }

  _cancelPending() {
    for (const [, resolve] of this.pending) resolve('deny')
    this.pending.clear()
    if (this.state.approvals?.length) this.set({ approvals: [] })
    this.epoch++
    this.controllers.forEach((c) => c.abort())
    this.controllers.clear()
    this.next = null
    this.queue = []
    if (this.state.queued) this.set({ queued: 0 })
  }

  /**
   * One model call, traced. Returns { raw, trace }.
   * toolSpeakers: people whose tools this call may use (one person, or the team for the one-writer engine).
   */
  async _complete(s, { system, prompt, signal, maxTokens, persona, kind, label, toolSpeakers, writer = false }) {
    const provider = persona?.llm?.provider || s.llm.provider
    const model = persona?.llm?.model?.trim() || s.llm.models[provider]
    const providerLabel = LLM_PROVIDERS[provider]?.label || provider

    const toolSet = toolSpeakers?.length ? buildToolSet(s, toolSpeakers, { writer }) : null
    let builtin = builtinPlan(toolSet, provider)
    if (builtin) builtin = await this._freshBuiltin(builtin, signal)
    if (toolSet) {
      const P = { ...DEFAULT_PROMPTS, ...s.prompts }
      system = `${system}\n\n${writer ? P.toolsWriter : fill(P.toolsAgent, { name: persona?.name || '', role: persona?.role || '' })}`
    }

    const trace = this.traces.begin({ kind, label, persona: persona?.name || null, provider: providerLabel, model, system, prompt })
    const onRetry = (e, wait) => {
      this.set({ calls: this.state.calls + 1 })
      trace.retries.push({ status: e.status || null, code: e.code || null, wait, message: String(e.message || '').slice(0, 300) })
      this.traces.update(trace)
      const why =
        e.code === 'json_validate_failed'
          ? `${providerLabel} returned invalid JSON, so the request is being repeated in plain-text mode.`
          : e.status === 429
            ? `${providerLabel}'s rate limit was hit. Retrying in ${Math.ceil(wait)} s…`
            : e.status
              ? `${providerLabel} had a hiccup (${e.status}). Retrying in ${Math.ceil(wait)} s…`
              : `Couldn't reach ${providerLabel}. Retrying…`
      this.retryNote = why
      this.set({ note: why })
    }
    const runTool = (callName, args) => this._runTool(toolSet, callName, args, { persona, signal, trace, personas: toolSpeakers })
    try {
      const raw = await complete({
        provider,
        apiKey: s.llm.keys[provider],
        model,
        system,
        prompt,
        signal,
        maxTokens,
        reasoningEffort: s.llm.reasoningEffort,
        onRetry,
        tools: toolSet?.tools,
        builtin,
        runTool,
        trace,
      })
      this.traces.finish(trace, { raw })
      return { raw, trace }
    } catch (e) {
      this.traces.finish(trace, { error: e.name === 'AbortError' ? 'Cancelled (you interrupted or ended the session).' : e.message || String(e), status: e.name === 'AbortError' ? 'cancelled' : 'error' })
      throw e
    } finally {
      this.set({ calls: this.state.calls + 1 })
      if (this.retryNote && this.state.note === this.retryNote) this.set({ note: null })
      this.retryNote = null
    }
  }

  /** Built-in MCP sends tokens to the provider, so refresh any OAuth token that is about to expire. */
  async _freshBuiltin(plan, signal) {
    const out = []
    for (const b of plan) {
      const sv = b.server
      if (sv.auth === 'oauth' && sv.oauth?.refreshToken && sv.oauth.expiresAt && sv.oauth.expiresAt < Date.now() + 60_000) {
        try {
          const oauth = await refreshOAuth(sv, signal)
          this.updateServer?.(sv.id, { oauth })
          out.push({ ...b, token: oauth.accessToken, headers: { Authorization: `Bearer ${oauth.accessToken}` } })
          continue
        } catch {
          /* send what we have; the provider will report the failure */
        }
      }
      out.push(b)
    }
    return out
  }

  _askApproval(info, signal) {
    return new Promise((resolve) => {
      const id = ++this.approvalSeq
      this.pending.set(id, resolve)
      this.set({ approvals: [...(this.state.approvals || []), { id, ...info }] })
      signal?.addEventListener('abort', () => this.resolveApproval(id, 'deny'))
    })
  }

  /** Run one app-side tool call: check who may use it, ask if needed, call the MCP server, record it. */
  async _runTool(toolSet, callName, args, { persona, signal, trace, personas }) {
    const t = toolSet?.byName[callName]
    const step = { route: 'app', name: t?.tool.name || callName, server: t?.server.label || '?', args: args || {}, startedAt: Date.now(), persona: persona?.name || null }
    trace.steps.push(step)
    this.traces.update(trace)
    const finish = (patch) => {
      Object.assign(step, patch, { durationMs: Date.now() - step.startedAt })
      this.traces.update(trace)
      return { text: step.result || '', isError: !!step.isError }
    }
    if (!t) return finish({ isError: true, result: `There is no tool called "${callName}".` })

    const callArgs = { ...(args || {}) }
    if (toolSet.writer) {
      const who = String(callArgs._speaker || '')
      delete callArgs._speaker
      step.persona = who || null
      step.args = callArgs
      if (!t.people.includes(who)) return finish({ isError: true, result: `${who || 'Nobody'} may not use this tool. Only ${t.people.join(', ')} can.`, blocked: true })
    }

    // Read the latest settings: the policy or the server's tokens may have changed.
    const s = this.getSettings()
    const server = (s.mcp?.servers || []).find((x) => x.id === t.server.id) || t.server
    const tool = server.tools?.find((x) => x.name === t.tool.name) || t.tool
    const policy = policyOf(tool)
    if (!server.enabled || policy === 'off') return finish({ isError: true, result: 'This tool is switched off.', blocked: true })
    if (policy === 'ask') {
      step.approval = 'waiting'
      this.traces.update(trace)
      const who = step.persona || personas?.[0]?.name || 'Someone'
      const decision = await this._askApproval({ persona: who, server: server.label, serverId: server.id, tool: tool.name, description: tool.description || '', args: callArgs }, signal)
      step.approval = decision
      if (decision === 'deny') return finish({ isError: true, result: 'The person running the meeting declined this tool call. Carry on without it.' })
      if (decision === 'always') this.setToolPolicy?.(server.id, tool.name, 'auto')
    }

    this.set({ toolActivity: { persona: step.persona, server: server.label, tool: tool.name } })
    try {
      const result = await callTool(server, tool.name, callArgs, {
        signal,
        schema: tool.inputSchema,
        onAuthUpdate: (oauth) => this.updateServer?.(server.id, { oauth }),
      })
      return finish({ result: resultText(result) || '(no output)', isError: !!result?.isError })
    } catch (e) {
      if (e.name === 'AbortError') throw e
      return finish({ isError: true, result: `The tool failed: ${e.message || e}` })
    } finally {
      this.set({ toolActivity: null })
    }
  }

  _applyBoard(board) {
    if (!board) return
    this.set({ board })
    this.boardHistory.push({ afterLine: this.state.transcript.length, board })
  }

  _spoken() {
    return this.state.transcript.filter((l) => !l.you).length
  }

  /** Runs once when a live session ends: final board summary, interview scorecard, auto-save. */
  async _finish() {
    const s = this.getSettings()
    try {
      if (this.state.kind === 'meeting' && s.board.mode === 'summary' && this.state.transcript.length) await this._summarizeBoard(s, true)
      if (this.state.kind === 'interview' && this.state.transcript.some((l) => l.you && !l.skipped)) await this._score(s)
    } finally {
      this.save()
    }
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

        turn.commit?.()
        const patch = turn.patch || {}
        const line = {
          id: ++this.lineId,
          you: false,
          speaker: turn.persona.name,
          name: turn.persona.name,
          role: turn.persona.role,
          text: turn.text,
          agendaIndex: patch.agenda?.index ?? this.state.agenda?.index ?? null,
          asked: this.state.interview?.asked ?? null,
        }
        this.set({ thinking: false, transcript: [...this.state.transcript, line], speaking: line.speaker, focus: null, ...patch })
        if (turn.boardDelta) this._applyBoard(mergeBoard(this.state.board, turn.boardDelta))

        // Prepare the next line (and its audio) while this one is spoken, unless it depends on your answer.
        if (!turn.final && !turn.awaitAnswer && this.state.status === 'running') {
          const p = this._prepare(epoch)
          p.catch(() => {})
          this.next = { epoch, promise: p }
        }

        const s = this.getSettings()
        if (this.state.kind === 'meeting' && s.board.mode === 'summary' && this._spoken() % Math.max(2, s.board.every) === 0) {
          this._summarizeBoard(s).catch(() => {})
        }

        await this.player.play(turn.audio, turn.text, turn.persona, turn.slot)
        if (epoch !== this.epoch) continue
        this.set({ speaking: null })

        if (turn.final) {
          this.next = null
          this.set({ status: 'ended' })
          await this._finish()
          break
        }
        if (turn.awaitAnswer) {
          this.set({ status: 'awaiting', focus: 'You' })
          break
        }
        await sleep(350)
      }
    } finally {
      this.looping = false
      if (this.state.thinking) this.set({ thinking: false })
    }
  }

  /** Next spoken turn: from the queue, or generated now. */
  async _prepare(epoch) {
    const s = this.getSettings()
    const ctrl = new AbortController()
    this.controllers.add(ctrl)
    try {
      let turn
      if (this.state.kind === 'interview') turn = await this._interviewTurn(s, ctrl.signal)
      else {
        while (!this.queue.length) {
          if (s.conversation.engine === 'agents') await this._agentTurn(s, ctrl.signal, epoch)
          else await this._writeLines(s, ctrl.signal, epoch)
          if (epoch !== this.epoch) throw abortError()
        }
        turn = this.queue.shift()
        this.set({ queued: this.queue.length })
      }
      if (epoch !== this.epoch) throw abortError()
      const cast = castOf(s, this.state.kind)
      const persona = cast.find((p) => p.name === turn.persona.name) || turn.persona
      const audio = await this.player.fetchAudio(turn.text, persona, s.tts, {
        signal: ctrl.signal,
        onNote: (note) => this.state.note !== note && this.set({ note }),
      })
      return { ...turn, persona, audio, slot: voiceSlot(cast, persona) }
    } finally {
      this.controllers.delete(ctrl)
    }
  }

  /* ---------- meeting moments shared by both engines ---------- */

  _moments(s, { count, agents }) {
    const host = hostOf(s, 'meeting')
    const transcript = this.state.transcript
    const spoken = transcript.filter((l) => !l.you).length
    const max = this.state.maxTurns
    const endsHere = spoken + count >= max
    const userLast = !!transcript.at(-1)?.you
    const firstRef = agents ? 'Your line' : count === 1 ? 'This line' : 'Line 1'
    const key = (k) => (agents && AGENT_PHASE[k]) || k
    const phases = []
    let hostFirst = false
    let agendaPatch = null

    if (spoken === 0) {
      hostFirst = true
      phases.push({ key: key('opening'), lineRef: firstRef })
    } else if (userLast) {
      phases.push({ key: key('replyToYou'), lineRef: firstRef })
    }

    const pos = agendaPosition(s.session.agenda, spoken)
    if (pos && spoken > 0 && !endsHere) {
      if (pos.transition && !userLast) {
        hostFirst = true
        phases.push({ key: 'agendaNext', item: pos.item, previous: pos.previous, n: pos.index + 1, total: pos.total, lineRef: firstRef })
      } else {
        phases.push({ key: 'agendaCurrent', item: pos.item, n: pos.index + 1, total: pos.total, left: pos.left })
      }
      agendaPatch = { agenda: { items: pos.items, index: pos.index } }
    }

    if (endsHere) phases.push({ key: key('closing'), lineRef: count === 1 || agents ? firstRef : `Line ${count}` })
    else if (!pos && spoken + count >= max - 4) phases.push({ key: 'converge' })
    else if (!phases.length) phases.push({ key: 'keepGoing' })

    return { host, spoken, endsHere, userLast, phases, hostFirst, agendaPatch, agendaList: pos?.items || agendaItems(s.session.agenda) }
  }

  /** One writer: one API call that writes 1…batchSize lines into the queue. */
  async _writeLines(s, signal, epoch) {
    const personas = castOf(s, 'meeting')
    const conv = s.conversation
    const spoken = this._spoken()
    const count = Math.max(1, Math.min(conv.batchSize, this.state.maxTurns - spoken))
    const m = this._moments(s, { count, agents: false })
    const transcript = this.state.transcript
    let forcedFirst = m.hostFirst ? m.host.name : null

    if (!forcedFirst && !m.userLast && conv.mode === 'mediator' && count === 1) {
      const recent = transcript.slice(-2)
      if (recent.length === 2 && recent.every((l) => !l.you && l.speaker !== m.host.name)) {
        forcedFirst = m.host.name
        m.phases.unshift({ key: 'mediatorNudge', lineRef: 'This line' })
      }
    }

    const inline = s.board.mode === 'inline'
    const { system, prompt } = buildPrompt({
      prompts: s.prompts,
      personas,
      topic: this.state.topic,
      transcript,
      phases: m.phases,
      mode: conv.mode,
      host: m.host,
      count,
      agendaList: m.agendaList,
      boardState: inline ? boardText(this.state.board) : null,
    })
    let lines = []
    let raw = ''
    for (let attempt = 0; attempt < 2 && !lines.length; attempt++) {
      const r = await this._complete(s, {
        system,
        prompt,
        signal,
        maxTokens: 250 + count * 150 + (inline ? 150 : 0),
        kind: 'writer',
        label: `Writer, ${count} line${count === 1 ? '' : 's'}`,
        toolSpeakers: personas,
        writer: true,
      })
      raw = r.raw
      lines = parseLines(raw, personas, transcript.at(-1)?.speaker)
      this.traces.update(r.trace, { parsed: lines.length ? lines.map((l) => `${l.persona.name}: ${l.text}`).join('\n') : '(nothing readable)' })
    }
    if (!lines.length) throw new Error('The model sent a reply the meeting could not read. Press Next line to retry, or try another model.')

    lines = lines.slice(0, count).map((l) => ({ ...l, final: false }))
    if (forcedFirst) lines[0].persona = personas.find((p) => p.name === forcedFirst) || lines[0].persona
    if (m.agendaPatch) lines[0].patch = m.agendaPatch
    if (spoken + lines.length >= this.state.maxTurns) {
      const last = lines.at(-1)
      last.final = true
      last.persona = m.host
    }
    if (inline) lines.at(-1).boardDelta = parseBoardField(raw)
    if (epoch !== this.epoch) return // interrupted while writing: these lines are stale
    this.queue.push(...lines)
    this.set({ queued: this.queue.length })
  }

  /** One agent per person: pick the speaker, then that person's own model call writes the line. */
  async _agentTurn(s, signal, epoch) {
    const personas = castOf(s, 'meeting')
    const conv = s.conversation
    const m = this._moments(s, { count: 1, agents: true })
    const transcript = this.state.transcript
    const last = transcript.at(-1)
    const lastSpeaker = last && !last.you ? last.speaker : null
    const inline = s.board.mode === 'inline'
    const shared = { prompts: s.prompts, personas, topic: this.state.topic, transcript, host: m.host, agendaList: m.agendaList, boardState: inline ? boardText(this.state.board) : null }

    let speaker = null
    let kind = 'speak'
    let reply = null
    let phases = m.phases

    if (m.hostFirst || m.endsHere) speaker = m.host
    if (conv.turnTaking === 'mediator' && !m.endsHere) {
      if (!speaker && lastSpeaker === m.host.name && this.invited) {
        speaker = this.invited
        phases = [{ key: 'agentInvited' }, ...phases]
      } else if (!speaker && lastSpeaker === m.host.name) {
        const others = personas.filter((p) => p.name !== m.host.name)
        speaker = others[Math.floor(Math.random() * others.length)]
      } else if (!speaker) speaker = m.host
      if (speaker.name === m.host.name) kind = 'mediator'
    }

    if (!speaker && conv.turnTaking === 'bids') {
      const bidders = personas.filter((p) => p.name !== lastSpeaker)
      const bids = await Promise.all(
        bidders.map(async (p) => {
          try {
            const { system, prompt } = buildAgentPrompt({ ...shared, persona: p, phases, kind: 'bid', notes: this.notes[p.name] })
            const { raw, trace } = await this._complete(s, { system, prompt, signal, maxTokens: 320, persona: p, kind: 'bid', label: `Bid: ${p.name}` })
            const v = parseJson(raw)
            const text = cleanText(v?.text, personas)
            this.traces.update(trace, { parsed: text ? `urge ${Number(v.urge) || 0}: ${text}` : '(nothing readable)' })
            return text ? { persona: p, urge: Number(v.urge) || 0, text, note: v.note, board: parseBoardField(raw) } : null
          } catch (e) {
            if (e.name === 'AbortError') throw e
            return null
          }
        }),
      )
      const valid = bids.filter(Boolean)
      if (!valid.length) throw new Error('No one could bid to speak (every bid call failed). Check the model settings, then press Next line.')
      const top = Math.max(...valid.map((b) => b.urge))
      const best = valid.filter((b) => b.urge === top)
      const win = best[Math.floor(Math.random() * best.length)]
      speaker = win.persona
      reply = { text: win.text, note: win.note, board: win.board }
    }

    if (!speaker && conv.turnTaking === 'director') {
      const { system, prompt } = buildDirectorPrompt({ ...shared, phases })
      const { raw, trace } = await this._complete(s, { system, prompt, signal, maxTokens: 80, kind: 'director', label: 'Director' })
      speaker = resolvePersona(parseJson(raw)?.next || raw, personas)
      this.traces.update(trace, { parsed: speaker ? `next: ${speaker.name}` : 'no valid name, picked someone else' })
      if (!speaker || (speaker.name === lastSpeaker && !m.userLast)) {
        const others = personas.filter((p) => p.name !== lastSpeaker)
        speaker = others[Math.floor(Math.random() * others.length)]
      }
    }
    if (!speaker) speaker = personas.find((p) => p.name !== lastSpeaker) || personas[0]

    if (!reply) {
      const { system, prompt } = buildAgentPrompt({ ...shared, persona: speaker, phases, kind, notes: this.notes[speaker.name] })
      for (let attempt = 0; attempt < 2 && !reply; attempt++) {
        const { raw, trace } = await this._complete(s, {
          system,
          prompt,
          signal,
          maxTokens: 400,
          persona: speaker,
          kind: kind === 'mediator' ? 'mediator' : 'agent',
          label: `${speaker.name} (${kind === 'mediator' ? 'mediator' : 'agent'})`,
          toolSpeakers: [speaker],
        })
        const v = parseJson(raw)
        const text = cleanText(v?.text ?? raw.replace(/\{[\s\S]*\}/, ''), personas)
        this.traces.update(trace, { parsed: text ? `${text}${v?.next ? `\nnext: ${v.next}` : ''}${v?.note ? `\nnote: ${v.note}` : ''}` : '(nothing readable)' })
        if (text) reply = { text, note: v?.note, next: v?.next, board: parseBoardField(raw) }
      }
      if (!reply) throw new Error(`${speaker.name}'s reply couldn't be read. Press Next line to retry, or try another model.`)
    }
    if (epoch !== this.epoch) return

    if (reply.note && String(reply.note).trim()) this.notes[speaker.name] = [...(this.notes[speaker.name] || []), String(reply.note).trim().slice(0, 200)].slice(-6)
    this.invited = kind === 'mediator' ? resolvePersona(reply.next, personas.filter((p) => p.name !== m.host.name)) : null
    this.queue.push({ persona: speaker, text: reply.text, final: m.endsHere, patch: m.agendaPatch, boardDelta: inline ? reply.board : null })
    this.set({ queued: this.queue.length })
  }

  async _summarizeBoard(s, force = false) {
    if (this.summarizing && !force) return
    this.summarizing = true
    const epoch = this.epoch
    try {
      const personas = castOf(s, 'meeting')
      const { system, prompt } = buildBoardSummaryPrompt({
        prompts: s.prompts,
        topic: this.state.topic,
        transcript: this.state.transcript,
        boardState: boardText(this.state.board),
        host: hostOf(s, 'meeting'),
        personas,
      })
      const { raw, trace } = await this._complete(s, { system, prompt, maxTokens: 700, kind: 'board', label: 'Whiteboard summary' })
      const board = parseBoardSummary(raw)
      this.traces.update(trace, { parsed: board ? boardText(board) : '(nothing readable)' })
      if (board && (epoch === this.epoch || force)) this._applyBoard(board)
    } catch {
      /* the board just stays as it is */
    } finally {
      this.summarizing = false
    }
  }

  /* ---------- mock interview ---------- */

  async _planInterview(s, epoch) {
    const cfg = s.interview
    const count = Math.max(1, cfg.count)
    const bank = (cfg.shuffle ? shuffle(cfg.bank) : cfg.bank).filter(Boolean)
    const jd = cfg.jd.trim()
    const useBank = cfg.source !== 'jd' && bank.length > 0
    const useJd = cfg.source !== 'bank' && jd.length > 0
    if (!useBank && !useJd) {
      throw new Error(
        cfg.source === 'bank'
          ? 'Your question bank is empty. Upload or paste questions first.'
          : cfg.source === 'jd'
            ? 'Paste a job description so the panel can prepare questions.'
            : 'Add questions to your bank or paste a job description first.',
      )
    }
    let jdCount = useJd ? (useBank ? Math.ceil(count / 2) : count) : 0
    let bankCount = count - jdCount
    if (bankCount > bank.length) {
      if (useJd) jdCount += bankCount - bank.length
      bankCount = bank.length
    }
    const fromBank = bank.slice(0, bankCount).map((question) => ({ question, source: 'bank' }))
    let fromJd = []
    if (jdCount > 0) {
      const ctrl = new AbortController()
      this.controllers.add(ctrl)
      try {
        const { system, prompt } = buildPlanPrompt({ prompts: s.prompts, role: cfg.role.trim(), jdText: jd, count: jdCount })
        const { raw, trace } = await this._complete(s, { system, prompt, signal: ctrl.signal, maxTokens: 200 + jdCount * 90, kind: 'plan', label: 'Interview questions' })
        const v = parseJson(raw)
        this.traces.update(trace, { parsed: Array.isArray(v?.questions) ? v.questions.join('\n') : '(read as plain text)' })
        let list = Array.isArray(v?.questions) ? v.questions : null
        if (!list) list = raw.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter((l) => l.endsWith('?'))
        fromJd = list
          .map((q) => String(typeof q === 'string' ? q : q?.question || '').trim())
          .filter(Boolean)
          .slice(0, jdCount)
          .map((question) => ({ question, source: 'jd' }))
      } finally {
        this.controllers.delete(ctrl)
      }
    }
    if (epoch !== this.epoch) throw abortError()
    // Interleave the two sources so the interview mixes them.
    const plan = []
    for (let i = 0; plan.length < fromBank.length + fromJd.length; i++) {
      if (fromJd[i]) plan.push(fromJd[i])
      if (fromBank[i]) plan.push(fromBank[i])
    }
    if (!plan.length) throw new Error("Couldn't prepare any questions. Check the job description and model settings, then try again.")
    return plan
  }

  /** Decide the next panel line without changing progress; progress commits when it is spoken. */
  async _interviewTurn(s, signal) {
    const iv = this.iv
    const panel = castOf(s, 'interview')
    const host = hostOf(s, 'interview')
    const last = this.state.transcript.at(-1)
    const byName = (n) => panel.find((p) => p.name === n) || host
    let phase
    let speaker
    let awaitAnswer = false
    let final = false
    let fallback = null
    let commit

    if (!iv.introDone) {
      speaker = host
      phase = { key: 'interviewIntro', asker: host.name }
      commit = () => (iv.introDone = true)
    } else if (last?.you && !last.skipped && iv.followupsLeft > 0 && iv.current) {
      speaker = byName(iv.current.asker)
      phase = { key: 'interviewFollowup', asker: speaker.name }
      awaitAnswer = true
      commit = () => (iv.followupsLeft -= 1)
    } else if (iv.index < iv.plan.length) {
      const q = iv.plan[iv.index]
      speaker = byName(q.asker)
      phase = { key: 'interviewAsk', asker: speaker.name, question: q.question, n: iv.index + 1, total: iv.plan.length }
      awaitAnswer = true
      fallback = q.question
      const index = iv.index
      commit = () => {
        iv.index = index + 1
        iv.current = q
        iv.followupsLeft = Math.max(0, s.interview.followUps)
        this.set({ interview: { ...this.state.interview, asked: index + 1 } })
      }
    } else {
      speaker = host
      phase = { key: 'interviewClosing', asker: host.name }
      final = true
      commit = () => (iv.closed = true)
    }

    const { system, prompt } = buildInterviewPrompt({
      prompts: s.prompts,
      panel,
      role: s.interview.role.trim(),
      jdText: s.interview.jd,
      transcript: this.state.transcript,
      phase,
      host,
    })
    let text = ''
    for (let attempt = 0; attempt < 2 && !text; attempt++) {
      const { raw, trace } = await this._complete(s, {
        system,
        prompt,
        signal,
        maxTokens: 350,
        persona: speaker,
        kind: 'interview',
        label: `${speaker.name}: ${{ interviewIntro: 'opening', interviewAsk: `question ${phase.n}`, interviewFollowup: 'follow-up', interviewClosing: 'closing' }[phase.key]}`,
        toolSpeakers: [speaker],
      })
      text = parseLines(raw, panel, last?.speaker)[0]?.text || ''
      this.traces.update(trace, { parsed: text || '(nothing readable)' })
    }
    if (!text && fallback) text = fallback
    if (!text) throw new Error('The model sent a reply the interview could not read. Press Resume to retry, or try another model.')
    return { persona: speaker, text, awaitAnswer, final, commit }
  }

  async _score(s) {
    this.set({ scoring: true, error: null })
    try {
      const { system, prompt } = buildScorePrompt({
        prompts: s.prompts,
        role: this.state.role,
        jdText: s.interview.jd,
        transcript: this.state.transcript.filter((l) => !l.skipped),
      })
      const { raw, trace } = await this._complete(s, { system, prompt, maxTokens: 2600, kind: 'score', label: 'Scorecard' })
      const v = parseJson(raw)
      this.traces.update(trace, { parsed: v ? `overall ${v.overall}/10, ${v.verdict || ''}\n${v.summary || ''}` : '(nothing readable)' })
      if (!v || (!v.answers && !v.summary)) throw new Error('The scorecard reply could not be read.')
      const num = (x) => Math.max(0, Math.min(10, Math.round(Number(x) || 0)))
      const list = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : [])
      this.set({
        scorecard: {
          overall: num(v.overall),
          verdict: String(v.verdict || ''),
          summary: String(v.summary || ''),
          strengths: list(v.strengths),
          improvements: list(v.improvements),
          answers: (Array.isArray(v.answers) ? v.answers : []).map((a) => ({
            question: String(a?.question || ''),
            score: num(a?.score),
            feedback: String(a?.feedback || ''),
            stronger: String(a?.stronger || ''),
          })),
        },
      })
    } catch (e) {
      this.set({ error: `Couldn't build the scorecard: ${e.message || e}` })
    } finally {
      this.set({ scoring: false })
    }
  }

  /* ---------- replay ---------- */

  _showReplayUpTo(index) {
    const session = this.replaySession
    if (!session) return
    const transcript = session.transcript.slice(0, index + 1)
    const board = boardAt(session, transcript.length) || emptyBoard()
    const lastTeam = [...transcript].reverse().find((l) => !l.you)
    const patch = {}
    if (session.agenda) patch.agenda = { items: session.agenda, index: lastTeam?.agendaIndex ?? -1 }
    if (session.interview) patch.interview = { ...session.interview, asked: lastTeam?.asked ?? 0 }
    this.set({ transcript, board, ...patch })
  }

  async _runReplay() {
    const session = this.replaySession
    if (!session) return
    const epoch = ++this.epoch
    const s = this.getSettings()
    const fallbackPersona = (l) => ({ name: l.name, role: l.role, gender: 'female', voice: {} })
    while (this.state.status === 'replaying' && epoch === this.epoch) {
      const { index, total } = this.state.replay
      if (index >= total) {
        this.set({ status: 'ended', speaking: null, focus: null, replay: null })
        return
      }
      const line = session.transcript[index]
      this._showReplayUpTo(index)
      this.set({ replay: { ...this.state.replay, index: index + 1 }, speaking: line.you ? null : line.speaker, focus: line.you ? 'You' : null })
      if (line.you) {
        // Your own lines are shown, not spoken, for about as long as it takes to read them.
        await sleep(900 + line.text.split(/\s+/).length * 280)
      } else {
        const persona = session.personas.find((p) => p.name === line.speaker) || fallbackPersona(line)
        let audio = null
        try {
          audio = await this.player.fetchAudio(line.text, persona, s.tts, { onNote: (note) => this.state.note !== note && this.set({ note }) })
        } catch {
          audio = null
        }
        if (epoch !== this.epoch) return
        await this.player.play(audio, line.text, persona, voiceSlot(session.personas, persona))
      }
      if (epoch !== this.epoch) return
      this.set({ speaking: null })
      await sleep(300)
    }
  }
}
