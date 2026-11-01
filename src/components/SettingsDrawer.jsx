import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { LLM_PROVIDERS } from '../lib/llm'
import { TTS_PROVIDERS } from '../lib/tts'
import { defaultPersonas, defaultPrompts } from '../lib/settings'
import { DEFAULT_PROMPTS, PROMPT_PARTS, buildPrompt } from '../lib/prompts'
import { MAX_TEAM, MIN_TEAM, newPersona } from '../data/personas'
import { defaultPanel } from '../lib/settings'
import ToolsSettings, { PersonTools } from './ToolsSettings'
import { findManager, hostOf, teamProblem } from '../lib/engine'
import { kokoro, KOKORO_VOICES, resolveDevice } from '../lib/kokoro'

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <span className="secret">
      <input type={show ? 'text' : 'password'} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
      <button type="button" className="link" onClick={() => setShow((s) => !s)}>
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  )
}

function PersonaEditor({ persona, onChange, voices, onTest, testDisabled, ttsProvider, onRemove, canRemove, showModel, removeLabel = 'Remove from table', settings }) {
  const set = (patch) => onChange({ ...persona, ...patch })
  const setVoice = (patch) => onChange({ ...persona, voice: { ...persona.voice, ...patch } })
  const setLook = (patch) => onChange({ ...persona, look: { ...persona.look, ...patch } })
  return (
    <details className="persona">
      <summary>
        <span className="swatch" style={{ background: persona.look.shirt }} />
        <b>{persona.name}</b>
        <span className="muted">{persona.role}</span>
      </summary>
      <div className="persona-body">
        <div className="two">
          <Field label="Name">
            <input value={persona.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Role">
            <input value={persona.role} onChange={(e) => set({ role: e.target.value })} />
          </Field>
        </div>
        <Field label="Personality" hint="How they think, what they care about, how they talk.">
          <textarea rows={3} value={persona.traits} onChange={(e) => set({ traits: e.target.value })} />
        </Field>
        {showModel && (
          <div className="two">
            <Field label="Own model provider" hint="Used in one-agent-per-person mode.">
              <select value={persona.llm?.provider || ''} onChange={(e) => set({ llm: { ...persona.llm, provider: e.target.value } })}>
                <option value="">Same as everyone</option>
                {Object.entries(LLM_PROVIDERS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Own model name" hint="Empty uses that provider's model.">
              <input value={persona.llm?.model || ''} onChange={(e) => set({ llm: { ...persona.llm, model: e.target.value } })} spellCheck={false} placeholder="Default" />
            </Field>
          </div>
        )}
        <Field label="Voice type">
          <select value={persona.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </Field>
        <fieldset className="look">
          <legend>Look</legend>
          <div className="swatches">
            {[
              ['skin', 'Skin'],
              ['hair', 'Hair'],
              ['shirt', 'Top'],
              ['pants', 'Trousers'],
            ].map(([k, label]) => (
              <label key={k} className="swatch-field">
                <input type="color" value={persona.look[k]} onChange={(e) => setLook({ [k]: e.target.value })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="two">
            <Field label="Hair style">
              <select value={persona.look.hairStyle} onChange={(e) => setLook({ hairStyle: e.target.value })}>
                <option value="short">Short</option>
                <option value="bob">Bob</option>
                <option value="long">Long</option>
                <option value="bun">Bun</option>
                <option value="none">Shaved</option>
              </select>
            </Field>
            <div className="checks">
              <label>
                <input type="checkbox" checked={persona.look.glasses} onChange={(e) => setLook({ glasses: e.target.checked })} /> Glasses
              </label>
              <label>
                <input type="checkbox" checked={persona.look.beard} onChange={(e) => setLook({ beard: e.target.checked })} /> Beard
              </label>
            </div>
          </div>
        </fieldset>
        {ttsProvider === 'elevenlabs' && (
          <Field label="ElevenLabs voice ID" hint="Find IDs in ElevenLabs › Voices.">
            <input value={persona.voice.elevenlabs} onChange={(e) => setVoice({ elevenlabs: e.target.value })} spellCheck={false} />
          </Field>
        )}
        {ttsProvider === 'kokoro' && (
          <Field label="Kokoro voice">
            <select value={persona.voice.kokoro || ''} onChange={(e) => setVoice({ kokoro: e.target.value })}>
              {['female', 'male'].map((g) => (
                <optgroup key={g} label={g === 'female' ? 'Female voices' : 'Male voices'}>
                  {KOKORO_VOICES.filter((v) => v.gender === g).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        {ttsProvider === 'fish' && (
          <Field label="Fish Audio voice ID" hint="The model ID from a voice page on fish.audio. Leave empty for the default voice.">
            <input value={persona.voice.fish} onChange={(e) => setVoice({ fish: e.target.value })} spellCheck={false} />
          </Field>
        )}
        <Field label="Browser voice" hint="Used when no cloud voice is available.">
          <select value={persona.voice.browserVoice} onChange={(e) => setVoice({ browserVoice: e.target.value })}>
            <option value="">Pick automatically</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Field>
        <div className="two">
          <Field label={`Pitch ${persona.voice.pitch.toFixed(2)}`}>
            <input type="range" min="0.6" max="1.5" step="0.01" value={persona.voice.pitch} onChange={(e) => setVoice({ pitch: +e.target.value })} />
          </Field>
          <Field label={`Speed ${persona.voice.rate.toFixed(2)}`}>
            <input type="range" min="0.7" max="1.4" step="0.01" value={persona.voice.rate} onChange={(e) => setVoice({ rate: +e.target.value })} />
          </Field>
        </div>
        {settings && (
          <fieldset className="look">
            <legend>Tools {persona.name} can use</legend>
            <PersonTools persona={persona} settings={settings} onChange={(tools) => onChange({ ...persona, tools })} />
          </fieldset>
        )}
        <div className="row">
          <button className="btn" onClick={() => onTest(persona)} disabled={testDisabled}>
            Hear {persona.name}
          </button>
          <button className="btn ghost danger" onClick={onRemove} disabled={!canRemove} title={canRemove ? '' : `A meeting needs at least ${MIN_TEAM} people`}>
            {removeLabel}
          </button>
        </div>
      </div>
    </details>
  )
}

function KokoroSettings({ device, onDevice }) {
  const st = useSyncExternalStore(kokoro.subscribe, kokoro.getStatus)
  const target = resolveDevice(device)
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  let status
  if (st.state === 'loading' && st.device === target)
    status = st.totalMB ? `Downloading voice model: ${st.progress}% of ${st.totalMB} MB` : 'Preparing the voice model…'
  else if (st.state === 'ready' && st.device === target) status = `Ready, running on ${target === 'webgpu' ? 'your GPU' : 'your CPU'}.`
  else if (st.state === 'error')
    status = /fetch|network/i.test(st.error)
      ? `Couldn't download Kokoro (${st.error}). The model comes from huggingface.co, so check your connection, then try again.`
      : `Couldn't load Kokoro: ${st.error}`
  else status = 'Not downloaded yet. It downloads once (about 90 MB on CPU, more on GPU) and is cached after that.'
  return (
    <div className="kokoro">
      <Field label="Run Kokoro on">
        <Segmented
          label="Kokoro device"
          value={device}
          options={[
            ['auto', hasGpu ? 'Auto (GPU)' : 'Auto (CPU)'],
            ['webgpu', 'GPU (WebGPU)'],
            ['wasm', 'CPU'],
          ]}
          onChange={(v) => {
            onDevice(v)
            kokoro.preload(v)
          }}
        />
      </Field>
      <p className={`fine${st.state === 'error' ? ' err' : ''}`} aria-live="polite">
        {status}
      </p>
      {st.state === 'loading' && st.device === target && (
        <div className="meter">
          <span style={{ width: `${st.progress}%` }} />
        </div>
      )}
      {st.note && <p className="fine">{st.note}</p>}
      {(st.state === 'idle' || st.state === 'error' || st.device !== target) && st.state !== 'loading' && (
        <button className="btn" onClick={() => kokoro.preload(device)}>
          {st.state === 'error' ? 'Try again' : 'Download voices now'}
        </button>
      )}
      <p className="fine">Each person gets their own Kokoro voice under Team. The GPU option is much faster if your browser supports WebGPU.</p>
    </div>
  )
}

function PromptEditor({ prompts, onChange, onResetAll, preview }) {
  const groups = [...new Set(PROMPT_PARTS.map((p) => p.group))]
  const [group, setGroup] = useState(groups[0])
  const edited = (g) => PROMPT_PARTS.filter((p) => p.group === g && prompts[p.key] != null && prompts[p.key] !== DEFAULT_PROMPTS[p.key]).length
  const shown = group === 'all' ? groups : groups.filter((g) => g === group)
  return (
    <div className="prompts">
      <Field label="Show">
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
              {edited(g) ? ` (${edited(g)} edited)` : ''}
            </option>
          ))}
          <option value="all">Everything</option>
          <option value="preview">Preview the assembled prompt</option>
        </select>
      </Field>
      {group !== 'preview' && shown.map((g) => (
        <div key={g} className="prompt-group">
          <h4>{g}</h4>
          {PROMPT_PARTS.filter((p) => p.group === g).map((part) => {
            const value = prompts[part.key] ?? DEFAULT_PROMPTS[part.key]
            const changed = value !== DEFAULT_PROMPTS[part.key]
            return (
              <details key={part.key} className="prompt">
                <summary>
                  <span>{part.label}</span>
                  {changed && <span className="edited">edited</span>}
                </summary>
                <div className="prompt-body">
                  <textarea
                    rows={Math.min(14, Math.max(2, value.split('\n').length + 1))}
                    value={value}
                    spellCheck={false}
                    onChange={(e) => onChange(part.key, e.target.value)}
                    aria-label={part.label}
                  />
                  {part.vars.length > 0 && (
                    <p className="fine vars">
                      Placeholders:{' '}
                      {part.vars.map((v) => (
                        <code key={v}>{`{${v}}`}</code>
                      ))}
                    </p>
                  )}
                  {part.warn && (
                    <p className="fine">
                      The app reads JSON with a <code>speaker</code> (the person's name) and <code>text</code>, or plain <code>Name: line</code> text. Keep one of
                      those shapes or lines won't be understood.
                    </p>
                  )}
                  {changed && (
                    <button className="link" onClick={() => onChange(part.key, DEFAULT_PROMPTS[part.key])}>
                      Reset this part
                    </button>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      ))}
      {group === 'preview' && (
      <div className="prompt preview open-preview">
        <div className="prompt-body">
          <p className="fine">What the model receives for the first line of a meeting with the current team and settings.</p>
          <h4>System</h4>
          <pre>{preview.system}</pre>
          <h4>Request</h4>
          <pre>{preview.prompt}</pre>
        </div>
      </div>
      )}
      <button className="btn ghost" onClick={onResetAll}>
        Reset all prompts
      </button>
    </div>
  )
}

const TABS = [
  ['model', 'Model'],
  ['voices', 'Voices'],
  ['conversation', 'Conversation'],
  ['people', 'People'],
  ['prompts', 'Prompts'],
  ['tools', 'Tools'],
  ['connection', 'Connection'],
]

export default function SettingsDrawer({ open, onClose, settings, setSettings, engine, running, topic, initialTab, initialPeople }) {
  // The drawer stays mounted while closed, so the last tab is remembered between visits.
  const [tab, setTab] = useState('model')
  const [peopleTab, setPeopleTab] = useState('team')
  useEffect(() => {
    if (!open) return
    if (initialTab) setTab(initialTab)
    if (initialPeople) setPeopleTab(initialPeople)
  }, [open, initialTab, initialPeople])

  const closeRef = useRef(null)
  const [voices, setVoices] = useState([])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const load = () => setVoices(engine.player.englishVoices())
    load()
    window.speechSynthesis?.addEventListener?.('voiceschanged', load)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.speechSynthesis?.removeEventListener?.('voiceschanged', load)
    }
  }, [open, onClose, engine])

  if (!open) return null
  const { llm, tts } = settings
  const alerts = {
    model: LLM_PROVIDERS[llm.provider]?.needsKey && !llm.keys[llm.provider] ? 'API key missing' : null,
    people: teamProblem(settings.personas) || teamProblem(settings.interview.panel) ? 'A name needs fixing' : null,
    connection: settings.connection === 'worker' && !settings.workerUrl?.trim() ? 'Worker URL missing' : null,
    tools: settings.mcp.servers.some((sv) => sv.enabled && sv.error) ? 'A server needs attention' : null,
  }
  const info = LLM_PROVIDERS[llm.provider]
  const update = (fn) =>
    setSettings((s) => {
      const next = JSON.parse(JSON.stringify(s))
      fn(next)
      return next
    })
  const touchVoices = () => engine.player.resetFailures()

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="drawer-top">
        <header>
          <h2 id="settings-title">Settings</h2>
          <button ref={closeRef} className="btn ghost" onClick={onClose}>
            Done
          </button>
        </header>

        <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              className={`stab${tab === key ? ' on' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              {alerts[key] && <span className="alert-dot" title={alerts[key]} aria-label={alerts[key]} />}
            </button>
          ))}
        </nav>
        </div>

        <div className="settings-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'model' && (
            <>
        <section>
          <h3>Conversation model</h3>
          <Segmented
            label="Model provider"
            value={llm.provider}
            options={Object.entries(LLM_PROVIDERS).map(([k, v]) => [k, v.label])}
            onChange={(v) => update((s) => (s.llm.provider = v))}
          />
          {info.needsKey ? (
            <Field
              label={info.keyName}
              hint={
                <>
                  Get one at{' '}
                  <a href={info.keyUrl} target="_blank" rel="noreferrer">
                    {new URL(info.keyUrl).host}
                  </a>
                  . Saved only in this browser.
                </>
              }
            >
              <SecretInput value={llm.keys[llm.provider] || ''} placeholder="Paste key" onChange={(v) => update((s) => (s.llm.keys[s.llm.provider] = v))} />
            </Field>
          ) : llm.provider === 'ollama' ? (
            <p className="fine">
              No key needed. Install Ollama, run <code>ollama pull {llm.models.ollama}</code>, and keep it running. Set <code>OLLAMA_URL</code> in <code>.env</code> if it isn't on
              port 11434.
            </p>
          ) : (
            <p className="fine">
              No key needed. ChatJimmy is a free public service without an official API, so it can be slow, rate-limited or change without notice. Its small models sometimes ignore
              the reply format; the meeting copes, but bigger models stay more in character.
            </p>
          )}
          <Field label="Model name" hint="Any model your provider offers.">
            <input value={llm.models[llm.provider]} onChange={(e) => update((s) => (s.llm.models[s.llm.provider] = e.target.value))} spellCheck={false} />
          </Field>
          {llm.provider === 'groq' && /gpt-oss/i.test(llm.models.groq) && (
            <Field
              label="Reasoning effort"
              hint="gpt-oss models think before answering, and that thinking uses part of the token budget. Low is fastest and least likely to run out of room before writing the reply."
            >
              <Segmented
                label="Reasoning effort"
                value={llm.reasoningEffort || 'low'}
                options={[
                  ['low', 'Low'],
                  ['medium', 'Medium'],
                  ['high', 'High'],
                ]}
                onChange={(v) => update((s) => (s.llm.reasoningEffort = v))}
              />
            </Field>
          )}
        </section>
            </>
          )}

          {tab === 'voices' && (
            <>
        <section>
          <h3>Voices</h3>
          <Segmented
            label="Voice provider"
            value={tts.provider}
            options={Object.entries(TTS_PROVIDERS).map(([k, v]) => [k, v.label])}
            onChange={(v) => {
              touchVoices()
              if (v === 'kokoro') kokoro.preload(tts.kokoroDevice)
              update((s) => (s.tts.provider = v))
            }}
          />
          {tts.provider === 'elevenlabs' && (
            <>
              <Field
                label="ElevenLabs API key"
                hint={
                  <>
                    Free tier works.{' '}
                    <a href={TTS_PROVIDERS.elevenlabs.keyUrl} target="_blank" rel="noreferrer">
                      Get a key
                    </a>
                  </>
                }
              >
                <SecretInput
                  value={tts.elevenKey}
                  placeholder="Paste key"
                  onChange={(v) => {
                    touchVoices()
                    update((s) => (s.tts.elevenKey = v))
                  }}
                />
              </Field>
              <Field label="ElevenLabs model">
                <input value={tts.elevenModel} onChange={(e) => update((s) => (s.tts.elevenModel = e.target.value))} spellCheck={false} />
              </Field>
            </>
          )}
          {tts.provider === 'fish' && (
            <>
              <Field
                label="Fish Audio API key"
                hint={
                  <>
                    <a href={TTS_PROVIDERS.fish.keyUrl} target="_blank" rel="noreferrer">
                      Get a key
                    </a>
                    , then add a voice ID per person under Team.
                  </>
                }
              >
                <SecretInput
                  value={tts.fishKey}
                  placeholder="Paste key"
                  onChange={(v) => {
                    touchVoices()
                    update((s) => (s.tts.fishKey = v))
                  }}
                />
              </Field>
              <Field label="Fish Audio model">
                <input value={tts.fishModel} onChange={(e) => update((s) => (s.tts.fishModel = e.target.value))} spellCheck={false} />
              </Field>
            </>
          )}
          {tts.provider === 'kokoro' && <KokoroSettings device={tts.kokoroDevice} onDevice={(v) => update((s) => (s.tts.kokoroDevice = v))} />}
          <p className="fine">
            {tts.provider === 'kokoro'
              ? 'Until Kokoro is ready, or if it fails, the browser voice takes over so the meeting keeps going.'
              : 'If the cloud voice fails or has no key, the browser voice takes over so the meeting keeps going.'}
          </p>
        </section>
            </>
          )}

          {tab === 'conversation' && (
            <>
        <section>
          <h3>Conversation style</h3>
          <Segmented
            label="Conversation style"
            value={settings.conversation.mode}
            options={[
              ['freeflow', 'Free flow'],
              ['mediator', 'Mediator'],
            ]}
            onChange={(v) => update((s) => (s.conversation.mode = v))}
          />
          <p className="fine">
            {settings.conversation.mode === 'mediator'
              ? 'The mediator frames each question, invites people by name and keeps the meeting moving.'
              : 'Anyone jumps in when the discussion calls for them.'}
          </p>
          <Field label={settings.conversation.mode === 'mediator' ? 'Mediator' : 'Opens and closes the meeting'}>
            <select value={settings.conversation.mediator} onChange={(e) => update((s) => (s.conversation.mediator = e.target.value))}>
              <option value="">Automatic ({findManager(settings.personas).name})</option>
              {settings.personas.map((p, i) => (
                <option key={i} value={p.name}>
                  {p.name}, {p.role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Who writes the lines">
            <Segmented
              label="Who writes the lines"
              value={settings.conversation.engine}
              options={[
                ['writer', 'One writer'],
                ['agents', 'One agent per person'],
              ]}
              onChange={(v) => update((s) => (s.conversation.engine = v))}
            />
          </Field>
          {settings.conversation.engine === 'agents' ? (
            <>
              <Field label="How the next speaker is chosen">
                <Segmented
                  label="Turn-taking"
                  value={settings.conversation.turnTaking}
                  options={[
                    ['director', 'Director'],
                    ['bids', 'Bids'],
                    ['mediator', 'Mediator agent'],
                  ]}
                  onChange={(v) => update((s) => (s.conversation.turnTaking = v))}
                />
              </Field>
              <p className="fine">
                {
                  {
                    director: 'A director call picks who speaks, then that person’s own agent writes the line. Two API calls per line.',
                    bids: `Every person except the last speaker bids, in parallel, with how much they want to speak and what they’d say. The highest bid is spoken. ${Math.max(1, settings.personas.length - 1)} API calls per line, which can hit free-tier rate limits.`,
                    mediator: `${hostOf(settings, 'meeting').name}’s agent moderates and names who speaks next. One API call per line.`,
                  }[settings.conversation.turnTaking]
                }{' '}
                Each agent keeps private notes during the meeting, and can use its own model (set under Team).
              </p>
            </>
          ) : null}
          {settings.conversation.engine === 'writer' && (
          <Field
            label={`Lines per API call: ${settings.conversation.batchSize}`}
            hint={`About ${Math.ceil(settings.maxTurns / settings.conversation.batchSize)} API calls per meeting, plus one each time you jump in. Writing more lines at once uses fewer calls, but the lines already written are dropped when you interrupt.`}
          >
            <input type="range" min="1" max="10" step="1" value={settings.conversation.batchSize} onChange={(e) => update((s) => (s.conversation.batchSize = +e.target.value))} />
          </Field>
          )}
        </section>
        <section>
          <h3>Whiteboard</h3>
          <Segmented
            label="Whiteboard updates"
            value={settings.board.mode}
            options={[
              ['inline', 'In each reply'],
              ['summary', 'Summary call'],
              ['off', 'Off'],
            ]}
            onChange={(v) => update((s) => (s.board.mode = v))}
          />
          {settings.board.mode === 'summary' && (
            <Field label={`Update every ${settings.board.every} lines`}>
              <input type="range" min="2" max="20" step="1" value={settings.board.every} onChange={(e) => update((s) => (s.board.every = +e.target.value))} />
            </Field>
          )}
          <p className="fine">
            {
              {
                inline: 'The model adds new decisions, action items and open questions as part of each reply. No extra API calls.',
                summary: 'A separate call rewrites the whole board every few lines, and once more at the end. Tidier, but uses extra calls.',
                off: 'The whiteboard shows only the topic and agenda.',
              }[settings.board.mode]
            }
          </p>
        </section>
        <section>
          <h3>Meeting length</h3>
          <Field label={`${settings.maxTurns} lines before the manager wraps up`}>
            <input type="range" min="8" max="60" step="1" value={settings.maxTurns} onChange={(e) => update((s) => (s.maxTurns = +e.target.value))} />
          </Field>
        </section>
            </>
          )}

          {tab === 'people' && (
            <>
              <Segmented
                label="Who to edit"
                value={peopleTab}
                options={[
                  ['team', `Team (${settings.personas.length})`],
                  ['panel', `Interview panel (${settings.interview.panel.length})`],
                ]}
                onChange={setPeopleTab}
              />
              {peopleTab === 'team' ? (
                <>
        <section>
          <h3>Team</h3>
          {teamProblem(settings.personas) && (
            <p className="msg error" role="alert">
              {teamProblem(settings.personas)}
            </p>
          )}
          <p className="fine">
            {settings.personas.length} people at the table. Each person is identified by their name.
            {' '} Changes apply from the next line{running ? '; pause the meeting to add or remove people' : ''}.
          </p>
          {settings.personas.map((p, i) => (
            <PersonaEditor
              key={i}
              persona={p}
              voices={voices}
              ttsProvider={tts.provider}
              testDisabled={running}
              showModel={settings.conversation.engine === 'agents'}
              settings={settings}
              onTest={(persona) => engine.testVoice(persona)}
              onChange={(np) =>
                update((s) => {
                  // Names identify people, so keep the mediator choice pointing at the renamed person.
                  if (s.conversation.mediator && s.conversation.mediator === s.personas[i].name) s.conversation.mediator = np.name
                  s.personas[i] = np
                })
              }
              canRemove={!running && settings.personas.length > MIN_TEAM}
              onRemove={() =>
                update((s) => {
                  s.personas.splice(i, 1)
                  if (s.conversation.mediator === p.name) s.conversation.mediator = ''
                })
              }
            />
          ))}
          <div className="row">
            <button
              className="btn"
              disabled={running || settings.personas.length >= MAX_TEAM}
              onClick={() => update((s) => s.personas.push(newPersona(s.personas)))}
            >
              Add a teammate
            </button>
            <button className="btn ghost" disabled={running} onClick={() => update((s) => (s.personas = defaultPersonas()))}>
              Reset team to defaults
            </button>
          </div>
          {settings.personas.length >= MAX_TEAM && <p className="fine">The table seats up to {MAX_TEAM} people.</p>}
        </section>
                </>
              ) : (
                <>
        <section>
          <h3>Interview panel</h3>
          {teamProblem(settings.interview.panel) && (
            <p className="msg error" role="alert">
              {teamProblem(settings.interview.panel)}
            </p>
          )}
          <p className="fine">
            The people who interview you in mock interview mode. The one with a manager or lead role opens and closes, and the others take turns asking. Your empty chair faces them.
          </p>
          {settings.interview.panel.map((p, i) => (
            <PersonaEditor
              key={i}
              persona={p}
              voices={voices}
              ttsProvider={tts.provider}
              testDisabled={running}
              onTest={(persona) => engine.testVoice(persona)}
              settings={settings}
              onChange={(np) => update((s) => (s.interview.panel[i] = np))}
              canRemove={!running && settings.interview.panel.length > 1}
              removeLabel="Remove from panel"
              onRemove={() => update((s) => s.interview.panel.splice(i, 1))}
            />
          ))}
          <div className="row">
            <button className="btn" disabled={running || settings.interview.panel.length >= 5} onClick={() => update((s) => s.interview.panel.push(newPersona(s.interview.panel)))}>
              Add a panelist
            </button>
            <button className="btn ghost" disabled={running} onClick={() => update((s) => (s.interview.panel = defaultPanel()))}>
              Reset panel to defaults
            </button>
          </div>
        </section>
                </>
              )}
            </>
          )}

          {tab === 'prompts' && (
            <>
        <section>
          <h3>Prompts</h3>
          <p className="fine">Every piece of text sent to the model. Placeholders in braces are filled in for each request.</p>
          <PromptEditor
            prompts={settings.prompts}
            onChange={(key, value) => update((s) => (s.prompts[key] = value))}
            onResetAll={() => update((s) => (s.prompts = defaultPrompts()))}
            preview={buildPrompt({
              prompts: settings.prompts,
              personas: settings.personas,
              topic: topic?.trim() || 'your topic',
              transcript: [],
              phases: [{ key: 'opening', lineRef: settings.conversation.batchSize > 1 ? 'Line 1' : 'This line' }],
              mode: settings.conversation.mode,
              host: hostOf(settings, 'meeting'),
              count: settings.conversation.batchSize,
            })}
          />
        </section>
            </>
          )}

          {tab === 'tools' && <ToolsSettings settings={settings} update={update} />}

          {tab === 'connection' && (
            <>
        <section>
          <h3>Connection</h3>
          <Segmented
            label="Connection"
            value={settings.connection}
            options={[
              ['proxy', 'Proxy on this site'],
              ['worker', 'Cloudflare Worker'],
              ['direct', 'Direct'],
            ]}
            onChange={(v) => {
              touchVoices()
              update((s) => (s.connection = v))
            }}
          />
          {settings.connection === 'worker' && (
            <Field label="Worker URL" hint="For example https://team-room.your-name.workers.dev. Add this site to ALLOWED_ORIGINS in worker/wrangler.toml.">
              <input value={settings.workerUrl} placeholder="https://…workers.dev" onChange={(e) => update((s) => (s.workerUrl = e.target.value))} spellCheck={false} />
            </Field>
          )}
          <p className="fine">
            {settings.connection === 'proxy'
              ? 'Calls go to /proxy on this site: the Vite dev server when you run it locally, or the Cloudflare Worker when the site is deployed on it. No CORS problems with any provider.'
              : settings.connection === 'worker'
                ? 'Calls go through your Cloudflare Worker at another address. Your keys stay in this browser and the Worker only relays them. Ollama is not reachable from a Worker.'
                : 'The browser calls each API itself, so it also works as a plain static site. Some providers block direct browser calls (CORS). If you see a "couldn’t reach" error, use a proxy instead. Ollama needs OLLAMA_ORIGINS="*" in this mode.'}
          </p>
        </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
