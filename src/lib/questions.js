// Turn an uploaded or pasted question bank (txt, md, csv, json, html) into a list of questions.

function htmlToLines(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript').forEach((n) => n.remove())
  const lines = []
  // Elements that study guides commonly use for questions.
  doc.querySelectorAll('[class*="question" i], [data-question], summary, h1, h2, h3, h4, h5, dt, li, p, td').forEach((n) => {
    const t = n.textContent.replace(/\s+/g, ' ').trim()
    if (t) lines.push(t)
  })
  return lines
}

function jsonToLines(text) {
  try {
    const v = JSON.parse(text)
    const out = []
    const walk = (x) => {
      if (typeof x === 'string') out.push(x)
      else if (Array.isArray(x)) x.forEach(walk)
      else if (x && typeof x === 'object') {
        if (typeof x.question === 'string') out.push(x.question)
        else if (typeof x.q === 'string') out.push(x.q)
        else Object.values(x).forEach(walk)
      }
    }
    walk(v)
    return out
  } catch {
    return null
  }
}

const QPREFIX = /^\s*(?:q(?:uestion)?\s*\d*\s*[:.)-]|\d+\s*[.)]|[-*•])\s*/i

/** Extract likely interview questions. Plain one-per-line text is taken as-is. */
export function extractQuestions(text, filename = '') {
  const name = filename.toLowerCase()
  let lines
  let plainList = false
  if (name.endsWith('.html') || name.endsWith('.htm') || /^\s*<(!doctype|html|body|div)/i.test(text)) lines = htmlToLines(text)
  else if (name.endsWith('.json') || /^\s*[[{]/.test(text)) lines = jsonToLines(text) || text.split('\n')
  else {
    lines = text.split('\n')
    if (name.endsWith('.csv')) lines = lines.map((l) => l.split(',')[0].replace(/^"|"$/g, ''))
    plainList = true
  }
  const cleaned = lines.map((l) => l.replace(QPREFIX, '').replace(/\s+/g, ' ').trim()).filter((l) => l.length >= 12 && l.length <= 300)
  const questions = cleaned.filter((l) => l.endsWith('?') || /^(what|why|how|when|where|which|who|explain|describe|tell me|walk me|design|implement|compare|can you|have you|give an example)\b/i.test(l))
  // A plain list with few question marks is probably one question per line already.
  const result = plainList && questions.length < cleaned.length / 3 ? cleaned : questions
  const seen = new Set()
  return result.filter((q) => {
    const k = q.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
