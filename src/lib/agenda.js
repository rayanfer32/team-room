// Agenda mode: items in order, each with a budget of lines.

export function agendaItems(agenda) {
  if (!agenda?.enabled) return []
  return String(agenda.items || '')
    .split('\n')
    .map((s) => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
}

/** Total team lines: one opening, the agenda budget, one closing. */
export function agendaTurns(agenda) {
  const items = agendaItems(agenda)
  if (!items.length) return null
  return items.length * Math.max(1, agenda.linesPerItem || 1) + 2
}

/**
 * Where the meeting is on the agenda after `spoken` team lines.
 * Returns null when no agenda is active.
 */
export function agendaPosition(agenda, spoken) {
  const items = agendaItems(agenda)
  if (!items.length) return null
  const per = Math.max(1, agenda.linesPerItem || 1)
  const k = Math.max(0, spoken - 1) // line 0 is the opening
  const index = Math.min(items.length - 1, Math.floor(k / per))
  const left = Math.max(1, per - (k % per))
  const transition = spoken > 1 && k % per === 0 && Math.floor(k / per) < items.length
  return { items, index, item: items[index], left, total: items.length, transition, previous: index > 0 ? items[index - 1] : null }
}
