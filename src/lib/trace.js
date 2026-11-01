// In-memory record of every model call in the current session (cleared when a new one starts).

const LIMIT = 400

export class TraceStore {
  constructor() {
    this.items = []
    this.listeners = new Set()
    this.seq = 0
    this.snapshot = { items: [], version: 0 }
  }

  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snapshot

  emit() {
    this.snapshot = { items: this.items, version: this.snapshot.version + 1 }
    this.listeners.forEach((f) => f())
  }

  clear() {
    this.items = []
    this.emit()
  }

  /** Start a trace entry. Mutate it freely, then call update(entry) to refresh the inspector. */
  begin(fields) {
    const entry = {
      id: ++this.seq,
      startedAt: Date.now(),
      status: 'running',
      steps: [],
      notes: [],
      retries: [],
      usage: null,
      request: {},
      ...fields,
    }
    this.items = [...this.items, entry].slice(-LIMIT)
    this.emit()
    return entry
  }

  update(entry, patch = {}) {
    Object.assign(entry, patch)
    this.items = this.items.map((e) => (e.id === entry.id ? { ...entry } : e))
    this.emit()
  }

  finish(entry, patch = {}) {
    this.update(entry, { durationMs: Date.now() - entry.startedAt, status: patch.error ? 'error' : 'ok', ...patch })
  }
}
