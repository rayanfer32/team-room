// Reading whatever the model sent back: JSON (one line or many), "Name: line" scripts, or plain speech.


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

export function resolvePersona(raw, personas) {
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

export function cleanText(text, personas) {
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


/** First JSON object in a reply, or null. */
export function parseJson(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  for (const s of [m[0], m[0].replace(/[\u201c\u201d]/g, '"')]) {
    try {
      return JSON.parse(s)
    } catch {
      /* try the next variant */
    }
  }
  // Rescue a few common fields from malformed JSON.
  const pick = (k) => m[0].match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1]
  const num = m[0].match(/"urge"\s*:\s*(\d+(?:\.\d+)?)/)?.[1]
  const out = { text: pick('text'), next: pick('next'), note: pick('note'), speaker: pick('speaker') }
  if (num) out.urge = +num
  return Object.values(out).some((v) => v != null) ? out : null
}
