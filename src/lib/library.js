// Saved meetings and interviews (text only), kept in this browser.

const KEY = 'team-room-library-v1'
const LIMIT = 40

export function listSessions() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(all) ? all.sort((a, b) => b.savedAt - a.savedAt) : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)))
    return true
  } catch {
    return false
  }
}

/** Insert or update (same id). Returns the id, or null if storage is full. */
export function saveSession(session) {
  const id = session.id || `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const list = listSessions().filter((s) => s.id !== id)
  list.unshift({ ...session, id, savedAt: Date.now() })
  return write(list) ? id : null
}

export function deleteSession(id) {
  write(listSessions().filter((s) => s.id !== id))
}

/** The board as it looked after line n of a saved session. */
export function boardAt(session, n) {
  let board = null
  for (const h of session.boardHistory || []) if (h.afterLine <= n) board = h.board
  return board
}
