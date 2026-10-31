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

async function post(url, headers, body, signal) {
  let res
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error('Could not reach the model. Is the dev server running (npm run dev)?')
  }
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

/** One completion. Returns the raw text the model produced. */
export async function complete({ provider, apiKey, model, system, prompt, signal, maxTokens = 400 }) {
  const info = LLM_PROVIDERS[provider]
  if (!info) throw new Error(`Unknown model provider "${provider}".`)
  if (info.needsKey && !apiKey) throw new Error(`Add your ${info.keyName} in Settings to start the meeting.`)
  if (!model) throw new Error(`Set a ${info.label} model name in Settings.`)

  switch (provider) {
    case 'claude': {
      const data = await post(
        '/proxy/anthropic/v1/messages',
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        { model, max_tokens: maxTokens, temperature: 0.9, system, messages: [{ role: 'user', content: prompt }] },
        signal,
      )
      return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    }
    case 'groq': {
      const data = await post(
        '/proxy/groq/openai/v1/chat/completions',
        { Authorization: `Bearer ${apiKey}` },
        {
          model,
          temperature: 0.9,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        },
        signal,
      )
      return data.choices?.[0]?.message?.content || ''
    }
    case 'gemini': {
      const data = await post(
        `/proxy/gemini/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {},
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: Math.max(2048, maxTokens * 2), responseMimeType: 'application/json' },
        },
        signal,
      )
      return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
    }
    case 'ollama': {
      const data = await post(
        '/proxy/ollama/api/chat',
        {},
        {
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0.9, num_predict: maxTokens },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        },
        signal,
      ).catch((e) => {
        if (e.name === 'AbortError') throw e
        throw new Error(`Ollama: ${e.message}. Make sure Ollama is running and "${model}" is pulled (ollama pull ${model}).`)
      })
      return data.message?.content || ''
    }
    case 'chatjimmy': {
      let res
      try {
        res = await fetch('/proxy/chatjimmy/api/chat', {
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
        })
      } catch (e) {
        if (e.name === 'AbortError') throw e
        throw new Error('Could not reach ChatJimmy. Is the dev server running (npm run dev)?')
      }
      if (!res.ok) throw new Error(`ChatJimmy ${await readError(res)}`)
      return cleanJimmy(await res.text())
    }
  }
}
