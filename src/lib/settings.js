import { DEFAULT_PANEL, DEFAULT_PERSONAS, MAX_TEAM, MIN_TEAM, newPersona } from '../data/personas'
import { DEFAULT_PROMPTS, LEGACY_PROMPTS } from './prompts'

const KEY = 'team-room-settings-v1'

export const DEFAULT_SETTINGS = {
  llm: {
    provider: 'groq',
    keys: { claude: '', groq: '', gemini: '' },
    models: {
      claude: 'claude-haiku-5-5',
      groq: 'llama-3.3-70b-versatile',
      gemini: 'gemini-2.5-flash',
      ollama: 'llama3.2',
      chatjimmy: 'llama3.1-8B',
    },
    reasoningEffort: 'low', // Groq gpt-oss models: 'low' | 'medium' | 'high'
  },
  tts: {
    provider: 'elevenlabs',
    elevenKey: '',
    elevenModel: 'eleven_flash_v2_5',
    fishKey: '',
    fishModel: 's1',
    kokoroDevice: 'auto',
  },
  maxTurns: 24,
  conversation: {
    mode: 'freeflow', // 'freeflow' | 'mediator'
    mediator: '', // a person's name; empty = whoever has a manager/lead role
    batchSize: 1, // lines written per API call (one-writer engine)
    engine: 'writer', // 'writer' (one model voices everyone) | 'agents' (one agent per person)
    turnTaking: 'director', // agents only: 'director' | 'bids' | 'mediator'
  },
  board: {
    mode: 'inline', // 'inline' (part of each reply) | 'summary' (separate call) | 'off'
    every: 6, // summary mode: lines between updates
  },
  session: {
    kind: 'meeting', // 'meeting' | 'interview'
    agenda: { enabled: false, items: '', linesPerItem: 6 },
  },
  interview: {
    role: '',
    jd: '',
    bank: [],
    source: 'both', // 'bank' | 'jd' | 'both'
    count: 6,
    followUps: 1,
    shuffle: true,
    panel: DEFAULT_PANEL,
  },
  personas: DEFAULT_PERSONAS,
  prompts: DEFAULT_PROMPTS,
  mcp: {
    // Each server: { id, label, url, enabled, auth: 'none'|'bearer'|'oauth', headerName, token,
    //   oauth: { clientId, scope, accessToken, refreshToken, expiresAt, ... }, route: 'auto'|'app',
    //   tools: [{ name, description, inputSchema, annotations, policy }] | null, syncedAt, error }
    servers: [],
  },
  traceOpen: false,
  connection: 'proxy', // 'proxy' (/proxy on this site) | 'direct' (browser calls each API) | 'worker' (a Cloudflare Worker URL)
  workerUrl: '',
}

const clone = (o) => JSON.parse(JSON.stringify(o))

/** Fill in any fields an older saved persona is missing. */
function mergePersona(saved, i, defaults = DEFAULT_PERSONAS) {
  // eslint-disable-next-line no-unused-vars
  const { id, ...p } = saved // older versions stored a fixed id; names identify people now
  const base = defaults.find((d) => d.name === p.name) || defaults[i] || newPersona()
  return { ...base, ...p, name: p.name ?? base.name, look: { ...base.look, ...p.look }, voice: { ...base.voice, ...p.voice } }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return clone(DEFAULT_SETTINGS)
    const s = JSON.parse(raw)
    const d = DEFAULT_SETTINGS
    return {
      ...d,
      ...s,
      llm: {
        ...d.llm,
        ...s.llm,
        keys: { ...d.llm.keys, ...s.llm?.keys },
        models: { ...d.llm.models, ...s.llm?.models },
      },
      tts: { ...d.tts, ...s.tts },
      conversation: { ...d.conversation, ...s.conversation },
      prompts: { ...d.prompts, ...editedPrompts(s.prompts) },
      connection: ['direct', 'worker'].includes(s.connection) ? s.connection : 'proxy',
      mcp: { servers: Array.isArray(s.mcp?.servers) ? s.mcp.servers : [] },
      board: { ...d.board, ...s.board },
      session: { ...d.session, ...s.session, agenda: { ...d.session.agenda, ...s.session?.agenda } },
      interview: {
        ...d.interview,
        ...s.interview,
        bank: Array.isArray(s.interview?.bank) ? s.interview.bank : [],
        panel: Array.isArray(s.interview?.panel) && s.interview.panel.length ? s.interview.panel.map((p, i) => mergePersona(p, i, DEFAULT_PANEL)) : clone(DEFAULT_PANEL),
      },
      personas:
        Array.isArray(s.personas) && s.personas.length >= MIN_TEAM && s.personas.length <= MAX_TEAM
          ? s.personas.map((p, i) => mergePersona(p, i))
          : clone(d.personas),
    }
  } catch {
    return clone(DEFAULT_SETTINGS)
  }
}

/** Keep only prompts the person actually changed, so improved defaults still reach them. */
function editedPrompts(prompts = {}) {
  const out = {}
  for (const [k, v] of Object.entries(prompts || {})) {
    if (typeof v !== 'string' || v === DEFAULT_PROMPTS[k]) continue
    if (LEGACY_PROMPTS[k]?.includes(v)) continue // an unedited copy of an older default
    out[k] = v
  }
  return out
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, prompts: editedPrompts(s.prompts) }))
  } catch {
    /* storage full or blocked: settings just won't persist */
  }
}

export const defaultPersonas = () => clone(DEFAULT_PERSONAS)
export const defaultPanel = () => clone(DEFAULT_PANEL)
export const defaultPrompts = () => clone(DEFAULT_PROMPTS)
