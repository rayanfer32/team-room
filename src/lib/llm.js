import { endpoint, unreachable } from './services'

export const LLM_PROVIDERS = {
  claude: { label: 'Claude', needsKey: true, keyUrl: 'https://console.anthropic.com/settings/keys', keyName: 'Anthropic API key' },
  groq: { label: 'Groq', needsKey: true, keyUrl: 'https://console.groq.com/keys', keyName: 'Groq API key (free tier)' },
  gemini: { label: 'Gemini', needsKey: true, keyUrl: 'https://aistudio.google.com/apikey', keyName: 'Gemini API key (free tier)' },
  ollama: { label: 'Ollama', needsKey: false, keyUrl: 'https://ollama.com/download', keyName: '' },
  chatjimmy: { label: 'ChatJimmy', needsKey: false, keyUrl: 'https://chatjimmy.ai', keyName: '' },
}

/** ChatJimmy appends a <|stats|>…<|/stats|> block and may wrap the reply in quotes. */
function cleanJimmy(text) {
  let t = text.replace(/<\|stats\|>[\s\S]*?(<\|\/stats\|>|$)/g, '').trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      t = JSON.parse(t)
    } catch {
      t = t.slice(1, -1)
    }
  }
  return t.trim()
}

export async function readError(res) {
  let text = ''
  try {
    text = await res.text()
    const j = JSON.parse(text)
    text = j?.error?.message || j?.error || j?.message || j?.detail || text
  } catch {
    /* keep raw text */
  }
  if (typeof text !== 'string') text = JSON.stringify(text)
  return `${res.status}: ${text.slice(0, 220) || res.statusText}`
}

/* ---------------- errors and retries ---------------- */

/** An HTTP error from a provider, with the useful parts pulled out. */
export class ApiError extends Error {
  constructor({ status, code, message, retryAfter, failedGeneration, service }) {
    super(message || `HTTP ${status}`)
    this.status = status
    this.code = code || ''
    this.retryAfter = retryAfter // seconds, or null
    this.failedGeneration = failedGeneration ?? null
    this.service = service
  }
}

class NetworkError extends Error {}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

/** "Please try again in 2.5s" / "in 750ms" / "in 1m3.5s" → seconds. */
function retryHint(message) {
  const m = String(message || '').match(/try again in\s+(?:(\d+)m)?\s*(\d+(?:\.\d+)?)?\s*(ms|s)?/i)
  if (!m) return null
  const mins = Number(m[1] || 0)
  const n = Number(m[2] || 0)
  return mins * 60 + (m[3] === 'ms' ? n / 1000 : n)
}

async function toApiError(res, service) {
  let raw = ''
  let body = null
  try {
    raw = await res.text()
    body = JSON.parse(raw)
  } catch {
    /* not JSON */
  }
  const err = body?.error && typeof body.error === 'object' ? body.error : body || {}
  const message = String(err.message || (typeof body?.error === 'string' ? body.error : '') || body?.detail || raw || res.statusText).slice(0, 400)
  const header = Number(res.headers.get('retry-after'))
  return new ApiError({
    status: res.status,
    code: err.code || err.status || err.type || '',
    message,
    retryAfter: Number.isFinite(header) && header > 0 ? header : retryHint(message),
    failedGeneration: err.failed_generation,
    service,
  })
}

async function send(service, path, init) {
  let res
  try {
    res = await fetch(endpoint(service, path), init)
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new NetworkError(unreachable(service))
  }
  if (!res.ok) throw await toApiError(res, service)
  return res
}

async function postJson(service, path, headers, body, signal) {
  const res = await send(service, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  return res.json()
}

const RETRIES = { rate: 2, server: 2, network: 1 }
const MAX_WAIT = 20 // seconds; longer waits are reported instead of silently blocking the meeting

/**
 * Run a request, retrying what is worth retrying:
 * rate limits (after the wait the provider asks for), server/capacity errors (backoff), and one network blip.
 */
async function withRetries(fn, { signal, onRetry }) {
  const used = { rate: 0, server: 0, network: 0 }
  for (;;) {
    try {
      return await fn()
    } catch (e) {
      if (e.name === 'AbortError') throw e
      let wait = null
      if (e instanceof ApiError && e.status === 429 && used.rate < RETRIES.rate) {
        const ask = e.retryAfter ?? 2 * (used.rate + 1)
        if (ask <= MAX_WAIT && !/per day|\(TPD\)|\(RPD\)|daily/i.test(e.message)) {
          wait = ask + 0.25
          used.rate++
        }
      } else if (e instanceof ApiError && (e.status >= 500 || e.status === 498) && used.server < RETRIES.server) {
        wait = [1.5, 4][used.server]
        used.server++
      } else if (e instanceof NetworkError && used.network < RETRIES.network) {
        wait = 1
        used.network++
      }
      if (wait == null) {
        e.retried = used.rate + used.server + used.network
        throw e
      }
      onRetry?.(e, wait)
      await sleep(wait * 1000, signal)
    }
  }
}

const LIMIT_NAMES = { TPM: 'tokens per minute', RPM: 'requests per minute', TPD: 'tokens per day', RPD: 'requests per day' }

/** Turn a provider error into a message a person can act on. */
export function friendlyError(e, { label, model }) {
  if (e.name === 'AbortError') return e
  if (e instanceof NetworkError) return new Error(e.message)
  if (!(e instanceof ApiError)) return e
  const msg = e.message
  const code = String(e.code)
  const retried = e.retried ? ` Retried ${e.retried} time${e.retried === 1 ? '' : 's'}.` : ''
  const detail = msg ? ` (${label} said: ${msg.length > 160 ? `${msg.slice(0, 160)}…` : msg})` : ''

  if (code === 'json_validate_failed')
    return new Error(
      `${label} couldn't produce valid JSON with "${model}" this time, even after retrying in plain-text mode. This happens now and then with some models. Press Next line to try again, lower "Lines per API call", or pick a different model in Settings.`,
    )
  if (e.status === 401 || /invalid.?api.?key|incorrect api key|unauthorized|authentication/i.test(`${code} ${msg}`))
    return new Error(`${label} rejected the API key. Check it in Settings.${detail}`)
  if (e.status === 403) return new Error(`${label} refused the request (403). Your key may not have access to "${model}", or the service isn't available in your region.${detail}`)
  if (e.status === 404 || /model_not_found|decommission|does not exist|not found/i.test(`${code} ${msg}`))
    return new Error(`${label} doesn't recognise the model "${model}". It may have been renamed or retired. Change the model name in Settings.${detail}`)
  if (e.status === 413 || /context.?length|too large|too long|reduce the length|maximum context/i.test(`${code} ${msg}`))
    return new Error(`The request was too long for "${model}". Lower "Lines per API call" or the meeting length in Settings, or use a model with a larger context.${detail}`)
  if (e.status === 429) {
    const kind = msg.match(/\((TPM|RPM|TPD|RPD)\)/)?.[1]
    const which = kind ? ` on ${LIMIT_NAMES[kind]}` : ''
    if (kind === 'TPD' || kind === 'RPD' || /per day|daily/i.test(msg))
      return new Error(`${label}'s daily limit${which} is used up for "${model}". Try again tomorrow, or switch to another model or provider in Settings.${detail}`)
    const secs = Math.ceil(e.retryAfter || 0)
    const wait = secs ? ` ${label} asked to wait about ${secs} second${secs === 1 ? '' : 's'}.` : ''
    return new Error(
      `${label}'s rate limit${which} was reached.${wait}${retried} Press Resume in a moment. To use fewer requests, raise "Lines per API call" or avoid the Bids turn-taking mode, which makes one call per person per line.`,
    )
  }
  if (e.status === 498) return new Error(`${label} is out of capacity for "${model}" right now.${retried} Try again shortly or pick another model.`)
  if (e.status >= 500) return new Error(`${label} is having trouble right now (${e.status}).${retried} Try again in a moment.${detail}`)
  return new Error(`${label} rejected the request (${e.status}).${detail}`)
}

/* ---------------- Groq ---------------- */

const isGptOss = (model) => /gpt-oss/i.test(model)
const isReasoning = (model) => /gpt-oss|qwen3|deepseek-r1|reason/i.test(model)
// Thinking tokens count against the limit, so reasoning models get extra room on top of the answer.
const THINKING_BUDGET = { low: 1200, medium: 3000, high: 6000 }

async function groqChat({ apiKey, model, system, prompt, signal, maxTokens, reasoningEffort, onRetry, trace }) {
  const effort = ['low', 'medium', 'high'].includes(reasoningEffort) ? reasoningEffort : 'low'
  const budget = maxTokens + (isReasoning(model) ? THINKING_BUDGET[isGptOss(model) ? effort : 'medium'] : 0)
  const call = (jsonMode, tokens) =>
    withRetries(
      () =>
        postJson(
          'groq',
          '/openai/v1/chat/completions',
          { Authorization: `Bearer ${apiKey}` },
          {
            model,
            temperature: 0.9,
            max_completion_tokens: tokens,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
            ...(isGptOss(model) ? { reasoning_effort: effort, include_reasoning: false } : {}),
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          },
          signal,
        ),
      { signal, onRetry },
    )

  if (trace) trace.request = { ...trace.request, jsonMode: true, maxTokens: budget, ...(isGptOss(model) ? { reasoningEffort: effort } : {}) }
  let data
  try {
    data = await call(true, budget)
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'json_validate_failed') throw e
    // Groq checks JSON-mode output itself. If it kept the attempt, our own reader can often rescue it.
    if (e.failedGeneration && String(e.failedGeneration).trim()) return String(e.failedGeneration)
    // Empty attempt: usually the model ran out of room while thinking. Retry once without JSON mode, with more room.
    onRetry?.(e, 0)
    trace?.notes.push('JSON mode failed with no output; repeated in plain-text mode.')
    try {
      data = await call(false, Math.round(budget * 1.5))
    } catch (e2) {
      if (e2 instanceof ApiError && !e2.code) e2.code = 'json_validate_failed'
      throw e2
    }
  }
  addUsage(trace, data.usage?.prompt_tokens, data.usage?.completion_tokens)
  const choice = data.choices?.[0]
  const content = choice?.message?.content || ''
  if (trace) trace.finishReason = choice?.finish_reason
  if (!content.trim() && choice?.finish_reason === 'length') {
    trace?.notes.push('Ran out of tokens before replying; retried with twice the room.')
    const more = await call(false, Math.round(budget * 2))
    addUsage(trace, more.usage?.prompt_tokens, more.usage?.completion_tokens)
    return more.choices?.[0]?.message?.content || ''
  }
  return content
}

/** One completion. Returns the raw text the model produced. */
export async function complete(opts) {
  const info = LLM_PROVIDERS[opts.provider]
  try {
    return stripThinking(await completeRaw(opts))
  } catch (e) {
    throw friendlyError(e, { label: info?.label || opts.provider, model: opts.model })
  }
}

/** Some reasoning models put their thinking in the reply; it isn't meant to be spoken. */
const stripThinking = (text) => String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim()

const MAX_ROUNDS = 4

function addUsage(trace, input, output) {
  if (!trace) return
  trace.usage = trace.usage || { input: 0, output: 0 }
  trace.usage.input += Number(input) || 0
  trace.usage.output += Number(output) || 0
}

const parseArgs = (a) => {
  if (a && typeof a === 'object') return a
  try {
    return JSON.parse(a || '{}')
  } catch {
    return {}
  }
}

/** Gemini accepts a subset of JSON Schema; keep only what it understands. */
function geminiSchema(node) {
  if (!node || typeof node !== 'object') return { type: 'string' }
  const out = {}
  let type = node.type
  if (Array.isArray(type)) {
    if (type.includes('null')) out.nullable = true
    type = type.find((t) => t !== 'null') || 'string'
  }
  if (type) out.type = type
  if (node.description) out.description = String(node.description).slice(0, 500)
  if (Array.isArray(node.enum)) out.enum = node.enum.map(String)
  if (type === 'object' || node.properties) {
    out.type = 'object'
    out.properties = Object.fromEntries(Object.entries(node.properties || {}).map(([k, v]) => [k, geminiSchema(v)]))
    if (Array.isArray(node.required)) out.required = node.required.filter((r) => r in out.properties)
  }
  if (type === 'array') out.items = geminiSchema(node.items || { type: 'string' })
  for (const k of ['minimum', 'maximum', 'minItems', 'maxItems']) if (typeof node[k] === 'number') out[k] = node[k]
  if (!out.type) out.type = 'string'
  return out
}

/* ---------- Claude ---------- */

async function claudeChat({ apiKey, model, system, prompt, signal, maxTokens, onRetry, tools, builtin, runTool, trace }) {
  const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
  const messages = [{ role: 'user', content: prompt }]
  const body = { model, max_tokens: maxTokens + (tools || builtin ? 600 : 0), temperature: 0.9, system, messages }
  if (builtin?.length) {
    headers['anthropic-beta'] = 'mcp-client-2025-11-20'
    body.mcp_servers = builtin.map((b) => ({ type: 'url', url: b.server.url, name: b.name, ...(b.token ? { authorization_token: b.token } : {}) }))
    body.tools = builtin.map((b) => ({
      type: 'mcp_toolset',
      mcp_server_name: b.name,
      default_config: { enabled: false },
      configs: Object.fromEntries(b.tools.map((n) => [n, { enabled: true }])),
    }))
  } else if (tools?.length) body.tools = tools.map((t) => ({ name: t.callName, description: t.description, input_schema: t.schema }))
  if (trace) trace.request = { ...trace.request, maxTokens: body.max_tokens }

  for (let round = 0; ; round++) {
    const data = await withRetries(() => postJson('anthropic', '/v1/messages', headers, body, signal), { signal, onRetry })
    addUsage(trace, data.usage?.input_tokens, data.usage?.output_tokens)
    if (trace) trace.finishReason = data.stop_reason
    const content = data.content || []
    for (const b of content) {
      if (b.type === 'mcp_tool_use') trace?.steps.push({ route: 'built-in', id: b.id, server: b.server_name, name: b.name, args: b.input })
      if (b.type === 'mcp_tool_result') {
        const step = trace?.steps.find((x) => x.id === b.tool_use_id)
        if (step) {
          step.result = (b.content || []).map((c) => c.text || '').join('\n').slice(0, 8000)
          step.isError = !!b.is_error
        }
      }
    }
    const uses = content.filter((b) => b.type === 'tool_use')
    const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    if (data.stop_reason === 'pause_turn' && round < MAX_ROUNDS) {
      messages.push({ role: 'assistant', content })
      continue
    }
    if (!uses.length || data.stop_reason !== 'tool_use') return text
    messages.push({ role: 'assistant', content })
    const results = []
    for (const u of uses) {
      const r = await runTool(u.name, u.input || {})
      results.push({ type: 'tool_result', tool_use_id: u.id, content: r.text || '(no output)', is_error: !!r.isError })
    }
    messages.push({ role: 'user', content: results })
    if (round + 1 >= MAX_ROUNDS) body.tool_choice = { type: 'none' }
  }
}

/* ---------- Groq: tools (chat completions) and built-in MCP (Responses API) ---------- */

async function groqTools({ apiKey, model, system, prompt, signal, maxTokens, reasoningEffort, onRetry, tools, runTool, trace }) {
  const effort = ['low', 'medium', 'high'].includes(reasoningEffort) ? reasoningEffort : 'low'
  const budget = maxTokens + 600 + (isReasoning(model) ? THINKING_BUDGET[isGptOss(model) ? effort : 'medium'] : 0)
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ]
  const body = {
    model,
    temperature: 0.9,
    max_completion_tokens: budget,
    messages,
    tools: tools.map((t) => ({ type: 'function', function: { name: t.callName, description: t.description, parameters: t.schema } })),
    tool_choice: 'auto',
    ...(isGptOss(model) ? { reasoning_effort: effort, include_reasoning: false } : {}),
  }
  if (trace) trace.request = { ...trace.request, maxTokens: budget, jsonMode: false, ...(isGptOss(model) ? { reasoningEffort: effort } : {}) }
  let malformed = 0
  for (let round = 0; ; round++) {
    let data
    try {
      data = await withRetries(() => postJson('groq', '/openai/v1/chat/completions', { Authorization: `Bearer ${apiKey}` }, body, signal), { signal, onRetry })
    } catch (e) {
      // The model wrote a broken tool call. Try again, then once more without tools.
      if (e instanceof ApiError && e.code === 'tool_use_failed' && malformed < 2) {
        malformed++
        trace?.notes.push(`The model wrote a malformed tool call${malformed === 2 ? '; asked again without tools' : '; retried'}.`)
        if (malformed === 2) body.tool_choice = 'none'
        round--
        continue
      }
      throw e
    }
    addUsage(trace, data.usage?.prompt_tokens, data.usage?.completion_tokens)
    const choice = data.choices?.[0]
    const msg = choice?.message || {}
    if (trace) trace.finishReason = choice?.finish_reason
    if (!msg.tool_calls?.length) return msg.content || ''
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })
    for (const tc of msg.tool_calls) {
      const r = await runTool(tc.function?.name, parseArgs(tc.function?.arguments))
      messages.push({ role: 'tool', tool_call_id: tc.id, content: r.text || '(no output)' })
    }
    if (round + 1 >= MAX_ROUNDS) body.tool_choice = 'none'
  }
}

async function groqBuiltin({ apiKey, model, system, prompt, signal, maxTokens, reasoningEffort, onRetry, builtin, trace }) {
  const effort = ['low', 'medium', 'high'].includes(reasoningEffort) ? reasoningEffort : 'low'
  const budget = maxTokens + 800 + (isReasoning(model) ? THINKING_BUDGET[isGptOss(model) ? effort : 'medium'] : 0)
  const body = {
    model,
    instructions: system,
    input: prompt,
    temperature: 0.9,
    max_output_tokens: budget,
    tools: builtin.map((b) => ({
      type: 'mcp',
      server_label: b.name,
      server_url: b.server.url,
      ...(Object.keys(b.headers).length ? { headers: b.headers } : {}),
      require_approval: 'never',
      allowed_tools: b.tools,
    })),
    ...(isGptOss(model) ? { reasoning: { effort } } : {}),
  }
  if (trace) trace.request = { ...trace.request, maxTokens: budget, endpoint: 'responses' }
  const data = await withRetries(() => postJson('groq', '/openai/v1/responses', { Authorization: `Bearer ${apiKey}` }, body, signal), { signal, onRetry })
  addUsage(trace, data.usage?.input_tokens, data.usage?.output_tokens)
  const texts = []
  for (const item of data.output || []) {
    if (item.type === 'mcp_call')
      trace?.steps.push({
        route: 'built-in',
        server: item.server_label,
        name: item.name,
        args: parseArgs(item.arguments),
        result: String(item.output ?? '').slice(0, 8000),
        isError: !!item.error,
        error: item.error ? String(item.error) : undefined,
      })
    if (item.type === 'message') for (const c of item.content || []) if (c.type === 'output_text') texts.push(c.text)
  }
  return texts.join('\n') || data.output_text || ''
}

/* ---------- Gemini ---------- */

async function geminiChat({ apiKey, model, system, prompt, signal, maxTokens, onRetry, tools, runTool, trace }) {
  const contents = [{ role: 'user', parts: [{ text: prompt }] }]
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.9, maxOutputTokens: Math.max(2048, maxTokens * 2), ...(tools?.length ? {} : { responseMimeType: 'application/json' }) },
    ...(tools?.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.callName, description: t.description, parameters: geminiSchema(t.schema) })) }] } : {}),
  }
  if (trace) trace.request = { ...trace.request, maxTokens: body.generationConfig.maxOutputTokens, jsonMode: !tools?.length }
  const path = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  for (let round = 0; ; round++) {
    const data = await withRetries(() => postJson('gemini', path, {}, body, signal), { signal, onRetry })
    addUsage(trace, data.usageMetadata?.promptTokenCount, data.usageMetadata?.candidatesTokenCount)
    const cand = data.candidates?.[0]
    if (trace) trace.finishReason = cand?.finishReason
    const parts = cand?.content?.parts || []
    const calls = parts.filter((p) => p.functionCall)
    if (!calls.length || !runTool) return parts.map((p) => p.text || '').join('')
    contents.push(cand.content)
    const responses = []
    for (const p of calls) {
      const r = await runTool(p.functionCall.name, p.functionCall.args || {})
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result: r.text || '(no output)', ...(r.isError ? { error: true } : {}) } } })
    }
    contents.push({ role: 'user', parts: responses })
    if (round + 1 >= MAX_ROUNDS) body.toolConfig = { functionCallingConfig: { mode: 'NONE' } }
  }
}

/* ---------- Ollama ---------- */

async function ollamaChat({ model, system, prompt, signal, maxTokens, tools, runTool, trace }) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ]
  const body = {
    model,
    stream: false,
    options: { temperature: 0.9, num_predict: maxTokens + (tools?.length ? 600 : 0) },
    messages,
    ...(tools?.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.callName, description: t.description, parameters: t.schema } })) } : { format: 'json' }),
  }
  if (trace) trace.request = { ...trace.request, maxTokens: body.options.num_predict, jsonMode: !tools?.length }
  const call = () =>
    postJson('ollama', '/api/chat', {}, body, signal).catch((e) => {
      if (e.name === 'AbortError') throw e
      if (e instanceof ApiError && e.status === 404) throw new Error(`Ollama doesn't have "${model}". Run: ollama pull ${model}`)
      throw e
    })
  for (let round = 0; ; round++) {
    let data
    try {
      data = await call()
    } catch (e) {
      if (e instanceof ApiError && body.tools && /does not support tools/i.test(e.message)) {
        trace?.notes.push(`${model} doesn't support tools in Ollama; answered without them.`)
        delete body.tools
        body.format = 'json'
        round--
        continue
      }
      throw e
    }
    addUsage(trace, data.prompt_eval_count, data.eval_count)
    const msg = data.message || {}
    if (!msg.tool_calls?.length || !runTool) return msg.content || ''
    messages.push(msg)
    for (const tc of msg.tool_calls) {
      const r = await runTool(tc.function?.name, parseArgs(tc.function?.arguments))
      messages.push({ role: 'tool', content: r.text || '(no output)', tool_name: tc.function?.name })
    }
    if (round + 1 >= MAX_ROUNDS) delete body.tools
  }
}

async function completeRaw(opts) {
  const { provider, apiKey, model, system, prompt, signal, maxTokens = 400, onRetry, tools, builtin, trace } = opts
  const info = LLM_PROVIDERS[provider]
  if (!info) throw new Error(`Unknown model provider "${provider}".`)
  if (info.needsKey && !apiKey) throw new Error(`Add your ${info.keyName} in Settings to start the meeting.`)
  if (!model) throw new Error(`Set a ${info.label} model name in Settings.`)
  const useBuiltin = builtin?.length && ['claude', 'groq'].includes(provider)
  const useTools = !useBuiltin && tools?.length && provider !== 'chatjimmy'
  if (trace) {
    trace.request = { provider, model, route: useBuiltin ? 'built-in MCP' : useTools ? 'app-run tools' : 'no tools', tools: useBuiltin ? builtin.flatMap((b) => b.tools.map((t) => `${b.name}/${t}`)) : (tools || []).map((t) => t.callName) }
    if (tools?.length && provider === 'chatjimmy') trace.notes.push("ChatJimmy can't call tools, so this person's tools were skipped.")
  }

  switch (provider) {
    case 'claude':
      return claudeChat({ ...opts, maxTokens, tools: useTools ? tools : null, builtin: useBuiltin ? builtin : null })
    case 'groq':
      if (useBuiltin) return groqBuiltin({ ...opts, maxTokens })
      if (useTools) return groqTools({ ...opts, maxTokens })
      return groqChat({ apiKey, model, system, prompt, signal, maxTokens, reasoningEffort: opts.reasoningEffort, onRetry, trace })
    case 'gemini':
      return geminiChat({ ...opts, maxTokens, tools: useTools ? tools : null })
    case 'ollama':
      return ollamaChat({ ...opts, maxTokens, tools: useTools ? tools : null }).catch((e) => {
        if (e.name === 'AbortError') throw e
        if (e instanceof ApiError || e instanceof NetworkError)
          throw new Error(`${friendlyError(e, { label: 'Ollama', model }).message} Make sure Ollama is running and "${model}" is pulled (ollama pull ${model}).`)
        throw e
      })
    case 'chatjimmy': {
      if (trace) trace.request = { ...trace.request, maxTokens: null, jsonMode: false }
      const res = await withRetries(
        () =>
          send('chatjimmy', '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
              chatOptions: { selectedModel: model, systemPrompt: system, topK: 2 },
              attachment: null,
            }),
            signal,
          }),
        { signal, onRetry },
      )
      return cleanJimmy(await res.text())
    }
  }
}
