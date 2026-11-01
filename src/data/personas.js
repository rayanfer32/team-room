// Default team. Everything here is editable in Settings → Team.
// Each person is identified by their name, so names must be unique.
export const DEFAULT_PERSONAS = [
  {
    name: 'Priya',
    role: 'Product Owner',
    gender: 'female',
    traits:
      'Customer-obsessed and decisive. Thinks in user stories and outcomes, quotes user feedback, and pushes hard to keep the first release small. Warm, but firm about priorities.',
    look: { skin: '#b07848', hair: '#1f1512', hairStyle: 'long', shirt: '#d9a441', pants: '#3c4a5c', glasses: false, beard: false },
    voice: { elevenlabs: '21m00Tcm4TlvDq8ikWAM', fish: '', kokoro: 'af_heart', browserVoice: '', pitch: 1.12, rate: 1.03 },
  },
  {
    name: 'Arjun',
    role: 'Developer',
    gender: 'male',
    traits:
      'Pragmatic full-stack developer with dry humour. Estimates honestly, flags tech debt and unrealistic deadlines, and likes proposing the simplest thing that could work.',
    look: { skin: '#8d5a3b', hair: '#17110e', hairStyle: 'short', shirt: '#2f7f86', pants: '#2d2f36', glasses: false, beard: true },
    voice: { elevenlabs: 'TxGEqnHWrfWFTfGW9XjX', fish: '', kokoro: 'am_michael', browserVoice: '', pitch: 0.95, rate: 1.06 },
  },
  {
    name: 'Meera',
    role: 'Tester (QA)',
    gender: 'female',
    traits:
      'Sceptical and detail-focused QA engineer. Always asks "what happens when…" about edge cases, failure modes and accessibility. Cares about test plans and acceptance criteria.',
    look: { skin: '#c99a72', hair: '#2a1a14', hairStyle: 'bun', shirt: '#8e5a8c', pants: '#4a3f3a', glasses: true, beard: false },
    voice: { elevenlabs: 'MF3mGyEYCl7XYWbV9V6O', fish: '', kokoro: 'af_bella', browserVoice: '', pitch: 1.0, rate: 1.0 },
  },
  {
    name: 'Vikram',
    role: 'Architect',
    gender: 'male',
    traits:
      'Calm, big-picture solution architect. Weighs scalability, security, data and integration trade-offs, and sketches options before committing. Speaks slowly and precisely.',
    look: { skin: '#a5714c', hair: '#8f8a84', hairStyle: 'short', shirt: '#34508a', pants: '#2f3a33', glasses: true, beard: false },
    voice: { elevenlabs: 'pNInz6obpgDQGcFmaJgB', fish: '', kokoro: 'bm_george', browserVoice: '', pitch: 0.82, rate: 0.95 },
  },
  {
    name: 'Sarah',
    role: 'Engineering Manager',
    gender: 'female',
    traits:
      'Keeps the meeting on track. Timeboxes debates, tracks risks and dependencies, assigns owners and pulls the group toward clear decisions. Encouraging but no-nonsense.',
    look: { skin: '#e3bf9a', hair: '#6b4226', hairStyle: 'bob', shirt: '#c9606f', pants: '#3a3a44', glasses: false, beard: false },
    voice: { elevenlabs: 'EXAVITQu4vr4xnSDxMaL', fish: '', kokoro: 'bf_emma', browserVoice: '', pitch: 1.05, rate: 1.0 },
  },
]

export const EXAMPLE_TOPICS = [
  'Offline mode for our mobile app',
  'Migrating the monolith to microservices',
  'Adding an AI chat assistant to support',
  'Cutting app startup time in half',
]

export const MIN_TEAM = 2
export const MAX_TEAM = 8

const SKINS = ['#f1c9a5', '#e3bf9a', '#c99a72', '#b07848', '#8d5a3b', '#6b4430']
const HAIRS = ['#1f1512', '#3b2416', '#6b4226', '#a0703a', '#8f8a84', '#2a1a14']
const SHIRTS = ['#4c8c6a', '#d9784f', '#5b6fb5', '#c2a14a', '#7a5ca8', '#3d8fa8', '#b5577a', '#6f8f3a']
const PANTS = ['#2d2f36', '#3c4a5c', '#4a3f3a', '#2f3a33', '#3a3a44']
const SPARE_NAMES = ['Kiran', 'Neha', 'Rohan', 'Ananya', 'Dev', 'Isha', 'Leo', 'Maya', 'Arun', 'Zara']
const pick = (list) => list[Math.floor(Math.random() * list.length)]

/** A fresh teammate with a random look. Everything is editable afterwards. */
export function newPersona(existing = []) {
  const taken = new Set(existing.map((p) => p.name))
  const gender = existing.filter((p) => p.gender === 'female').length > existing.length / 2 ? 'male' : 'female'
  const name = SPARE_NAMES.find((n) => !taken.has(n)) || `Teammate ${existing.length + 1}`
  return {
    name,
    role: 'Team member',
    gender,
    traits: 'Curious and constructive. Asks clarifying questions and builds on other people’s ideas.',
    look: {
      skin: pick(SKINS),
      hair: pick(HAIRS),
      hairStyle: gender === 'male' ? pick(['short', 'short', 'none']) : pick(['long', 'bob', 'bun']),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      glasses: Math.random() > 0.6,
      beard: gender === 'male' && Math.random() > 0.6,
    },
    voice: {
      elevenlabs: gender === 'male' ? 'ErXwobaYiN019PkySvjV' : 'AZnzlk1XvdvUeBnXmlld',
      fish: '',
      kokoro: gender === 'male' ? 'am_fenrir' : 'af_nicole',
      browserVoice: '',
      pitch: 1,
      rate: 1,
    },
  }
}

/** Default mock-interview panel. Editable in Settings → Interview panel. */
export const DEFAULT_PANEL = [
  {
    name: 'Anita',
    role: 'Hiring Manager',
    gender: 'female',
    traits: 'Leads the panel. Friendly and structured. Cares about ownership, impact and how the candidate works with a team.',
    look: { skin: '#b07848', hair: '#1f1512', hairStyle: 'bob', shirt: '#4c6b8a', pants: '#2d2f36', glasses: true, beard: false },
    voice: { elevenlabs: 'EXAVITQu4vr4xnSDxMaL', fish: '', kokoro: 'af_heart', browserVoice: '', pitch: 1.05, rate: 1 },
  },
  {
    name: 'Karthik',
    role: 'Tech Lead',
    gender: 'male',
    traits: 'Goes deep on technical detail. Asks how things work under the hood, about trade-offs, and what the candidate would do differently.',
    look: { skin: '#8d5a3b', hair: '#17110e', hairStyle: 'short', shirt: '#3d8fa8', pants: '#2f3a33', glasses: false, beard: true },
    voice: { elevenlabs: 'TxGEqnHWrfWFTfGW9XjX', fish: '', kokoro: 'am_michael', browserVoice: '', pitch: 0.92, rate: 1.03 },
  },
  {
    name: 'Joanna',
    role: 'HR Partner',
    gender: 'female',
    traits: 'Warm and attentive. Asks about motivation, conflict, growth and culture fit, and listens for specific examples.',
    look: { skin: '#e3bf9a', hair: '#6b4226', hairStyle: 'long', shirt: '#b5577a', pants: '#3a3a44', glasses: false, beard: false },
    voice: { elevenlabs: '21m00Tcm4TlvDq8ikWAM', fish: '', kokoro: 'bf_emma', browserVoice: '', pitch: 1.1, rate: 1 },
  },
]
