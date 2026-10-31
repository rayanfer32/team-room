import { useEffect, useRef, useState } from 'react'
import { LLM_PROVIDERS } from '../lib/llm'
import { TTS_PROVIDERS } from '../lib/tts'
import { defaultPersonas } from '../lib/settings'

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

function PersonaEditor({ persona, onChange, voices, onTest, testDisabled, ttsProvider }) {
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
        <div className="two">
          <Field label="Shirt colour">
            <input type="color" value={persona.look.shirt} onChange={(e) => setLook({ shirt: e.target.value })} />
          </Field>
          <Field label="Voice type">
            <select value={persona.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </Field>
        </div>
        {ttsProvider === 'elevenlabs' && (
          <Field label="ElevenLabs voice ID" hint="Find IDs in ElevenLabs › Voices.">
            <input value={persona.voice.elevenlabs} onChange={(e) => setVoice({ elevenlabs: e.target.value })} spellCheck={false} />
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
        <button className="btn" onClick={() => onTest(persona)} disabled={testDisabled}>
          Hear {persona.name}
        </button>
      </div>
    </details>
  )
}

export default function SettingsDrawer({ open, onClose, settings, setSettings, engine, running }) {
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
        <header>
          <h2 id="settings-title">Settings</h2>
          <button ref={closeRef} className="btn ghost" onClick={onClose}>
            Done
          </button>
        </header>

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
          ) : (
            <p className="fine">
              No key needed. Install Ollama, run <code>ollama pull {llm.models.ollama}</code>, and keep it running. Set <code>OLLAMA_URL</code> in <code>.env</code> if it isn't on
              port 11434.
            </p>
          )}
          <Field label="Model name" hint="Any model your provider offers.">
            <input value={llm.models[llm.provider]} onChange={(e) => update((s) => (s.llm.models[s.llm.provider] = e.target.value))} spellCheck={false} />
          </Field>
        </section>

        <section>
          <h3>Voices</h3>
          <Segmented
            label="Voice provider"
            value={tts.provider}
            options={Object.entries(TTS_PROVIDERS).map(([k, v]) => [k, v.label])}
            onChange={(v) => {
              touchVoices()
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
          <p className="fine">If the cloud voice fails or has no key, the browser voice takes over so the meeting keeps going.</p>
        </section>

        <section>
          <h3>Meeting length</h3>
          <Field label={`${settings.maxTurns} lines before the manager wraps up`}>
            <input type="range" min="8" max="60" step="1" value={settings.maxTurns} onChange={(e) => update((s) => (s.maxTurns = +e.target.value))} />
          </Field>
        </section>

        <section>
          <h3>Team</h3>
          <p className="fine">Changes apply from the next line.</p>
          {settings.personas.map((p, i) => (
            <PersonaEditor
              key={p.id}
              persona={p}
              voices={voices}
              ttsProvider={tts.provider}
              testDisabled={running}
              onTest={(persona) => engine.testVoice(persona)}
              onChange={(np) => update((s) => (s.personas[i] = np))}
            />
          ))}
          <button className="btn ghost" onClick={() => update((s) => (s.personas = defaultPersonas()))}>
            Reset team to defaults
          </button>
        </section>
      </aside>
    </div>
  )
}
