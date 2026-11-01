// The live whiteboard: decisions, action items and open questions.

export const emptyBoard = () => ({ decisions: [], actions: [], questions: [] })
const MAX = 8
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 140)

function addUnique(list, items, key = (x) => norm(x)) {
  const out = [...list]
  for (const it of items) {
    const k = key(it)
    if (!k || out.some((o) => key(o) === k)) continue
    out.push(it)
  }
  return out.slice(-MAX)
}

function cleanActions(list) {
  return (Array.isArray(list) ? list : [])
    .map((a) => (typeof a === 'string' ? { task: clip(a), owner: '' } : { task: clip(a?.task || a?.text), owner: clip(a?.owner || a?.who) }))
    .filter((a) => a.task)
}
const cleanList = (list) => (Array.isArray(list) ? list : []).map((x) => clip(typeof x === 'string' ? x : x?.text)).filter(Boolean)

/** Add only the new items from an inline "board" delta. */
export function mergeBoard(board, delta) {
  if (!delta || typeof delta !== 'object') return board
  const answered = cleanList(delta.answered).map(norm)
  let questions = board.questions.filter((q) => !answered.some((a) => a && (norm(q).includes(a) || a.includes(norm(q)))))
  questions = addUnique(questions, cleanList(delta.questions))
  return {
    decisions: addUnique(board.decisions, cleanList(delta.decisions)),
    actions: addUnique(board.actions, cleanActions(delta.actions), (a) => norm(a.task)),
    questions,
  }
}

/** Replace the board with a full summary. */
export function replaceBoard(full) {
  if (!full || typeof full !== 'object') return null
  return {
    decisions: cleanList(full.decisions).slice(-MAX),
    actions: cleanActions(full.actions).slice(-MAX),
    questions: cleanList(full.questions).slice(-MAX),
  }
}

export const boardIsEmpty = (b) => !b || (!b.decisions.length && !b.actions.length && !b.questions.length)

/** Compact text version for prompts. */
export function boardText(b) {
  if (boardIsEmpty(b)) return '(empty)'
  const parts = []
  if (b.decisions.length) parts.push(`Decisions: ${b.decisions.join('; ')}`)
  if (b.actions.length) parts.push(`Actions: ${b.actions.map((a) => (a.owner ? `${a.task} (${a.owner})` : a.task)).join('; ')}`)
  if (b.questions.length) parts.push(`Open questions: ${b.questions.join('; ')}`)
  return parts.join('\n')
}

/** Pull a "board" object out of any JSON the model sent. */
export function parseBoardField(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0])
    return v && typeof v === 'object' && v.board && typeof v.board === 'object' ? v.board : null
  } catch {
    return null
  }
}

/** Parse a full-board summary reply. */
export function parseBoardSummary(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0])
    return replaceBoard(v.board && typeof v.board === 'object' ? v.board : v)
  } catch {
    return null
  }
}
