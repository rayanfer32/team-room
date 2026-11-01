import { useRef, useState, useSyncExternalStore } from 'react'
import { EXAMPLE_TOPICS } from '../data/personas'
import { kokoro } from '../lib/kokoro'
import { LLM_PROVIDERS } from '../lib/llm'
import { TTS_PROVIDERS } from '../lib/tts'
import { agendaItems, agendaTurns } from '../lib/agenda'
import { extractQuestions } from '../lib/questions'

const LIVE = ['running', 'paused', 'awaiting']
const REPLAY = ['replaying', 'replayPaused']

function statusLine(m) {
  if (m.approvals?.length) return 'Waiting for your OK on a tool'
  if (m.toolActivity) return `${m.toolActivity.persona || 'Someone'} is using ${m.toolActivity.server}: ${m.toolActivity.tool}`
  if (m.scoring) return 'Scoring your interview…'
  switch (m.status) {
    case 'idle':
      return 'Ready when you are'
    case 'ended':
      return m.kind === 'interview' ? 'Interview finished' : 'Meeting ended'
    case 'awaiting':
      return 'Your turn to answer'
    case 'replaying':
      return m.speaking ? `Replay: ${m.speaking} is speaking` : 'Replaying'
    case 'replayPaused':
      return 'Replay paused'
    case 'paused':
      return 'Paused'
    default:
      if (m.speaking) return `${m.speaking} is speaking`
      if (m.thinking) return m.kind === 'interview' && !m.interview ? 'Preparing your questions…' : 'Thinking about what to say…'
      return 'In session'
  }
}

function Segmented({ value, options, onChange, label, small }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** A tool call that needs your OK before it runs. */
function Approval({ a, more, engine }) {
  const args = JSON.stringify(a.args || {}, null, 2)
  return (
    <div className="approval" role="alertdialog" aria-labelledby={`appr-${a.id}`}>
      <p id={`appr-${a.id}`} className="approval-title">
        <b>{a.persona}</b> wants to use <b>{a.server}</b>: {a.tool}
      </p>
      {a.description && <p className="fine">{a.description.length > 180 ? `${a.description.slice(0, 180)}…` : a.description}</p>}
      {args !== '{}' && <pre className="approval-args">{args}</pre>}
      <div className="row">
        <button className="btn primary small" onClick={() => engine.resolveApproval(a.id, 'once')}>
          Allow once
        </button>
        <button className="btn small" onClick={() => engine.resolveApproval(a.id, 'always')}>
          Always allow
        </button>
        <button className="btn ghost small" onClick={() => engine.resolveApproval(a.id, 'deny')}>
          Deny
        </button>
      </div>
      {more > 0 && <p className="fine">{more} more waiting.</p>}
    </div>
  )
}

export const meetingReady = (settings, topic) => !!topic.trim() && (!settings.session.agenda.enabled || agendaItems(settings.session.agenda).length > 0)
export const interviewReady = (cfg) => !!cfg.role.trim() && ((cfg.source !== 'jd' && cfg.bank.length > 0) || (cfg.source !== 'bank' && !!cfg.jd.trim()))

/** Long topics are clamped to three lines, with a toggle to read the rest. */
function Topic({ text }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 110
  return (
    <div className="topic-block">
      <p className={`current-topic${long && !open ? ' clamped' : ''}`} title={long && !open ? text : undefined}>
        {text}
      </p>
      {long && (
        <button className="link small-link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

const names = (people) => {
  const n = people.map((p) => p.name)
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`
}

function MeetingSetup({ settings, update, topic, setTopic, onStart, host, onOpenSettings }) {
  const agenda = settings.session.agenda
  const items = agendaItems(agenda)
  const llm = LLM_PROVIDERS[settings.llm.provider]
  const voice = TTS_PROVIDERS[settings.tts.provider]
  const conv = settings.conversation
  const engineText =
    conv.engine === 'agents'
      ? `one agent per person (${{ director: 'a director picks who speaks', bids: 'people bid to speak', mediator: 'the mediator picks who speaks' }[conv.turnTaking]})`
      : `one writer${conv.batchSize > 1 ? `, ${conv.batchSize} lines per API call` : ''}`
  return (
    <div className="topic-form">
      <label htmlFor="topic">What should the team discuss?</label>
      <textarea
        id="topic"
        className="grow"
        rows={2}
        value={topic}
        placeholder="e.g. Should we ship dark mode before the payments revamp?"
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && meetingReady(settings, topic)) {
            e.preventDefault()
            onStart()
          }
        }}
      />
      <div className="chips" role="list" aria-label="Example topics">
        {EXAMPLE_TOPICS.map((t) => (
          <button key={t} role="listitem" className={`chip${topic === t ? ' on' : ''}`} onClick={() => setTopic(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="mode-row">
        <Segmented
          small
          label="Conversation style"
          value={conv.mode}
          options={[
            ['freeflow', 'Free flow'],
            ['mediator', 'Mediator'],
          ]}
          onChange={(v) => update((s) => (s.conversation.mode = v))}
        />
        <span className="fine">{conv.mode === 'mediator' ? `${host.name} moderates` : 'Anyone can jump in'}</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={agenda.enabled} onChange={(e) => update((s) => (s.session.agenda.enabled = e.target.checked))} />
        Follow an agenda
      </label>
      {agenda.enabled && (
        <div className="agenda-form">
          <textarea
            rows={3}
            value={agenda.items}
            placeholder={'One item per line, e.g.\nScope for v1\nRisks\nTimeline and owners'}
            onChange={(e) => update((s) => (s.session.agenda.items = e.target.value))}
            aria-label="Agenda items, one per line"
          />
          <label className="inline-field">
            Lines per item
            <input
              type="number"
              min="2"
              max="20"
              value={agenda.linesPerItem}
              onChange={(e) => update((s) => (s.session.agenda.linesPerItem = Math.max(2, Math.min(20, +e.target.value || 2))))}
            />
          </label>
          <p className="fine">{items.length ? `${items.length} items, about ${agendaTurns(agenda)} lines including the opening and closing.` : 'Add at least one item.'}</p>
        </div>
      )}
      <p className="fine">
        {settings.personas.length} people at the table. Talking with {llm.label} using {engineText}. Voices by {voice.label}.{' '}
        <button className="link" onClick={onOpenSettings}>
          Edit team and settings
        </button>
      </p>
    </div>
  )
}

function InterviewSetup({ settings, update, onStart, onOpenSettings }) {
  const cfg = settings.interview
  const fileRef = useRef(null)
  const [importNote, setImportNote] = useState('')

  const importFiles = async (files) => {
    let added = 0
    const all = [...cfg.bank]
    for (const f of files) {
      const text = await f.text()
      for (const q of extractQuestions(text, f.name)) {
        if (!all.some((x) => x.toLowerCase() === q.toLowerCase())) {
          all.push(q)
          added++
        }
      }
    }
    update((s) => (s.interview.bank = all))
    setImportNote(added ? `Added ${added} question${added === 1 ? '' : 's'}.` : 'No new questions found in that file.')
  }

  return (
    <div className="topic-form">
      <label htmlFor="role">Role you're interviewing for</label>
      <input id="role" value={cfg.role} placeholder="e.g. Senior Full-Stack Engineer at Impelsys" onChange={(e) => update((s) => (s.interview.role = e.target.value))} />

      <p className="field-label spaced">Where the questions come from</p>
      <Segmented
        label="Question source"
        value={cfg.source}
        options={[
          ['bank', 'My bank'],
          ['jd', 'Job description'],
          ['both', 'Both'],
        ]}
        onChange={(v) => update((s) => (s.interview.source = v))}
      />

      {cfg.source !== 'bank' && (
        <textarea
          rows={3}
          value={cfg.jd}
          placeholder="Paste the job description"
          onChange={(e) => update((s) => (s.interview.jd = e.target.value))}
          aria-label="Job description"
        />
      )}

      {cfg.source !== 'jd' && (
        <div className="bank">
          <div className="bank-row">
            <span>
              <b>{cfg.bank.length}</b> question{cfg.bank.length === 1 ? '' : 's'} in your bank
            </span>
            <button className="btn small" onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.html,.htm"
              hidden
              onChange={(e) => {
                importFiles([...e.target.files])
                e.target.value = ''
              }}
            />
          </div>
          {importNote && <p className="fine">{importNote}</p>}
          <details>
            <summary className="link">See and edit the questions</summary>
            <textarea
              rows={6}
              value={cfg.bank.join('\n')}
              placeholder="One question per line"
              onChange={(e) => update((s) => (s.interview.bank = e.target.value.split('\n')))}
              onBlur={() => update((s) => (s.interview.bank = s.interview.bank.map((q) => q.trim()).filter(Boolean)))}
              aria-label="Question bank, one per line"
            />
            <p className="fine">Upload text, Markdown, CSV, JSON or your HTML study guides. Questions are pulled out automatically.</p>
          </details>
        </div>
      )}

      <div className="two compact">
        <label className="inline-field">
          Questions
          <input type="number" min="1" max="20" value={cfg.count} onChange={(e) => update((s) => (s.interview.count = Math.max(1, Math.min(20, +e.target.value || 1))))} />
        </label>
        <label className="inline-field">
          Follow-ups each
          <input type="number" min="0" max="2" value={cfg.followUps} onChange={(e) => update((s) => (s.interview.followUps = Math.max(0, Math.min(2, +e.target.value || 0))))} />
        </label>
      </div>
      {cfg.source !== 'jd' && (
        <label className="check">
          <input type="checkbox" checked={cfg.shuffle} onChange={(e) => update((s) => (s.interview.shuffle = e.target.checked))} />
          Shuffle my bank
        </label>
      )}
      <p className="fine">
        {names(cfg.panel)} {cfg.panel.length === 1 ? 'is' : 'are'} on the panel. Answer by typing or with the microphone, and you get a scorecard at the end.{' '}
        <button className="link" onClick={onOpenSettings}>
          Edit panel
        </button>
      </p>
    </div>
  )
}

export default function MeetingPanel(props) {
  const { meeting: m, settings, update, host, onOpenSettings, onOpenLibrary, onShowScorecard, engine } = props
  const ko = useSyncExternalStore(kokoro.subscribe, kokoro.getStatus)
  const koLoading = settings.tts.provider === 'kokoro' && ko.state === 'loading'
  const live = LIVE.includes(m.status)
  const replay = REPLAY.includes(m.status)
  const setup = !live && !replay
  const teamTurns = m.transcript.filter((l) => !l.you).length
  const kind = setup ? settings.session.kind : m.kind
  const progress =
    m.kind === 'interview' ? ((m.interview?.asked || 0) / Math.max(1, m.interview?.total || 1)) * 100 : (teamTurns / Math.max(1, m.maxTurns)) * 100

  return (
    <section className="panel meeting" aria-label="Meeting controls">
      <header className="meeting-head">
        <div>
          <h1>Team room</h1>
          <p className={`status status-${m.status}`} aria-live="polite">
            <span className="pulse" aria-hidden="true" />
            {statusLine(m)}
          </p>
        </div>
        <div className="head-actions">
          <button className="icon-btn" onClick={onOpenLibrary} aria-label="Saved meetings" title="Saved meetings">
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path fill="currentColor" d="M6 2h12a1 1 0 0 1 1 1v19l-7-4-7 4V3a1 1 0 0 1 1-1Zm1 2v14.6l5-2.9 5 2.9V4H7Z" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => onOpenSettings()} aria-label="Open settings" title="Settings">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 4.6-.02-2.2 2-1.6-2-3.4-2.4.9a8 8 0 0 0-1.9-1.1L15.7 3h-4l-.4 2.6a8 8 0 0 0-1.9 1.1L7 5.9 5 9.3l2 1.6a8 8 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-.9c.6.5 1.2.8 1.9 1.1l.4 2.6h4l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4.9 2-3.4-2-1.6Z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="panel-body">
        {m.status === 'ended' && m.transcript.length > 0 && (
          <div className="last-session">
            <p className="fine">
              {m.scoring ? 'Scoring your answers…' : m.savedId ? 'Saved to your library.' : 'Not saved yet.'}{' '}
              {!m.savedId && !m.scoring && (
                <button className="link" onClick={() => engine.save()}>
                  Save it
                </button>
              )}
            </p>
            {m.scorecard && (
              <button className="btn" onClick={() => onShowScorecard(m.scorecard)}>
                View scorecard ({m.scorecard.overall}/10)
              </button>
            )}
          </div>
        )}

        {setup && (
          <>
            <Segmented
              label="Session type"
              value={settings.session.kind}
              options={[
                ['meeting', 'Team meeting'],
                ['interview', 'Mock interview'],
              ]}
              onChange={(v) => update((s) => (s.session.kind = v))}
            />
            {kind === 'interview' ? (
              <InterviewSetup settings={settings} update={update} onStart={props.onStartInterview} onOpenSettings={() => onOpenSettings('people', 'panel')} />
            ) : (
              <MeetingSetup
                settings={settings}
                update={update}
                topic={props.topic}
                setTopic={props.setTopic}
                onStart={props.onStart}
                host={host}
                onOpenSettings={() => onOpenSettings('people', 'team')}
              />
            )}
          </>
        )}

        {live && (
          <div className="in-session">
            <Topic text={m.kind === 'interview' ? m.role : m.topic} />
            {m.agenda && m.agenda.index >= 0 && (
              <p className="agenda-now">
                Item {m.agenda.index + 1} of {m.agenda.items.length}: <b>{m.agenda.items[m.agenda.index]}</b>
              </p>
            )}
            {m.kind === 'interview' && m.interview && (
              <p className="agenda-now">
                Question {Math.max(1, m.interview.asked)} of {m.interview.total}
              </p>
            )}
            <div className="meter" aria-label="Progress">
              <span style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <p className="fine stats">
              {m.kind === 'meeting' ? `${teamTurns} of ${m.maxTurns} lines, ` : ''}
              {m.calls} API {m.calls === 1 ? 'call' : 'calls'}
              {m.queued ? `, ${m.queued} written ahead` : ''}.
            </p>
            {m.status === 'awaiting' && <p className="your-turn">Answer in the box below, or press the microphone and speak.</p>}
          </div>
        )}

        {replay && m.replay && (
          <div className="in-session">
            <Topic text={m.replay.title} />
            <div className="meter" aria-label={`Line ${m.replay.index} of ${m.replay.total}`}>
              <span style={{ width: `${(m.replay.index / m.replay.total) * 100}%` }} />
            </div>
            <p className="fine stats">
              Line {Math.max(1, m.replay.index)} of {m.replay.total}. The saved lines are spoken again with your current voice settings.
            </p>
          </div>
        )}
      </div>

      <footer className="panel-actions">
        {m.approvals?.length > 0 && <Approval a={m.approvals[0]} more={m.approvals.length - 1} engine={engine} />}
        {m.error && (
          <p className="msg error" role="alert">
            {m.error}{' '}
            {/key|Settings|model|Worker/i.test(m.error) && (
              <button className="link" onClick={() => onOpenSettings(/Worker/i.test(m.error) ? 'connection' : 'model')}>
                Open settings
              </button>
            )}
          </p>
        )}
        {koLoading ? (
          <p className="msg note">Downloading Kokoro voices{ko.totalMB ? `: ${ko.progress}%` : '…'} The browser voice speaks until they're ready.</p>
        ) : (
          m.note && !m.error && <p className="msg note">{m.note}</p>
        )}

        {setup &&
          (kind === 'interview' ? (
            <button className="btn primary wide" onClick={props.onStartInterview} disabled={!interviewReady(settings.interview)}>
              Start interview
            </button>
          ) : (
            <button className="btn primary wide" onClick={props.onStart} disabled={!meetingReady(settings, props.topic)}>
              {m.status === 'ended' ? 'Start a new meeting' : 'Start meeting'}
            </button>
          ))}

        {live && (
          <div className="row">
            {m.status === 'running' && (
              <button className="btn primary" onClick={() => engine.pause()}>
                Pause
              </button>
            )}
            {m.status === 'paused' && (
              <>
                <button className="btn primary" onClick={() => engine.resume()}>
                  Resume
                </button>
                {m.kind === 'meeting' && (
                  <button className="btn" onClick={() => engine.step()}>
                    Next line
                  </button>
                )}
              </>
            )}
            {m.kind === 'interview' && m.status === 'awaiting' && (
              <button className="btn" onClick={() => engine.skipQuestion()}>
                Skip question
              </button>
            )}
            <button className="btn ghost" onClick={() => engine.end()}>
              {m.kind === 'interview' ? 'End' : 'End meeting'}
            </button>
            <button className="btn ghost" onClick={() => engine.save()} disabled={!m.transcript.length} title="Save to your library">
              {m.savedId ? 'Save again' : 'Save'}
            </button>
          </div>
        )}

        {replay && m.replay && (
          <div className="row">
            <button className="btn" onClick={() => engine.replaySeek(-1)} aria-label="Previous line">
              Back
            </button>
            {m.status === 'replaying' ? (
              <button className="btn primary" onClick={() => engine.pause()}>
                Pause
              </button>
            ) : (
              <button className="btn primary" onClick={() => engine.resume()}>
                Play
              </button>
            )}
            <button className="btn" onClick={() => engine.replaySeek(1)} aria-label="Next line">
              Forward
            </button>
            <button className="btn ghost" onClick={() => engine.stopReplay()}>
              Stop
            </button>
          </div>
        )}
      </footer>
    </section>
  )
}
