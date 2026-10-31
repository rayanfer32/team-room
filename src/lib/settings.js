import { DEFAULT_PERSONAS } from '../data/personas'

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
  personas: DEFAULT_PERSONAS,
}

const clone = (o) => JSON.parse(JSON.stringify(o))

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
      personas:
        Array.isArray(s.personas) && s.personas.length === d.personas.length
          ? s.personas.map((p, i) => ({
              ...d.personas[i],
              ...p,
              look: { ...d.personas[i].look, ...p.look },
              voice: { ...d.personas[i].voice, ...p.voice },
            }))
          : clone(d.personas),
    }
  } catch {
    return clone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked: settings just won't persist */
  }
}

export const defaultPersonas = () => clone(DEFAULT_PERSONAS)
