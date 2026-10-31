import { useSyncExternalStore } from 'react'
import { EXAMPLE_TOPICS } from '../data/personas'
import { kokoro } from '../lib/kokoro'
import { LLM_PROVIDERS } from '../lib/llm'
import { TTS_PROVIDERS } from '../lib/tts'

function statusLine(meeting, personas) {
  const { status, speakingId, thinking } = meeting
  if (status === 'idle') return 'Ready when you are'
  if (status === 'ended') return 'Meeting ended'
  if (speakingId) return `${personas.find((p) => p.id === speakingId)?.name ?? 'Someone'} is speaking`
  if (thinking) return 'Thinking about what to say…'
  if (status === 'paused') return 'Paused'
  return 'In session'
}

export default function MeetingPanel({ meeting, settings, host, topic, setTopic, onStart, onPause, onResume, onStep, onEnd, onOpenSettings, onSetMode }) {
  const { status, transcript, error, note } = meeting
  const teamTurns = transcript.filter((l) => l.speaker !== 'you').length
  const canEditTopic = status === 'idle' || status === 'ended'
  const llm = LLM_PROVIDERS[settings.llm.provider]
  const voice = TTS_PROVIDERS[settings.tts.provider]
  const ko = useSyncExternalStore(kokoro.subscribe, kokoro.getStatus)
  const koLoading = settings.tts.provider === 'kokoro' && ko.state === 'loading'

  return (
    <section className="panel meeting" aria-label="Meeting controls">
      <header className="meeting-head">
        <div>
          <h1>Team room</h1>
          <p className={`status status-${status}`} aria-live="polite">
            <span className="pulse" aria-hidden="true" />
            {statusLine(meeting, settings.personas)}
          </p>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="Open settings" title="Settings">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 4.6-.02-2.2 2-1.6-2-3.4-2.4.9a8 8 0 0 0-1.9-1.1L15.7 3h-4l-.4 2.6a8 8 0 0 0-1.9 1.1L7 5.9 5 9.3l2 1.6a8 8 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-.9c.6.5 1.2.8 1.9 1.1l.4 2.6h4l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4.9 2-3.4-2-1.6Z"
            />
          </svg>
        </button>
      </header>

      {canEditTopic ? (
        <div className="topic-form">
          <label htmlFor="topic">What should the team discuss?</label>
          <textarea
            id="topic"
            rows={2}
            value={topic}
            placeholder="e.g. Should we ship dark mode before the payments revamp?"
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && topic.trim()) {
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
            <div className="segmented small" role="radiogroup" aria-label="Conversation style">
              {[
                ['freeflow', 'Free flow'],
                ['mediator', 'Mediator'],
              ].map(([v, label]) => (
                <button key={v} role="radio" aria-checked={settings.conversation.mode === v} className={settings.conversation.mode === v ? 'on' : ''} onClick={() => onSetMode(v)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="fine">
              {settings.conversation.mode === 'mediator' ? `${host.name} moderates` : 'Anyone can jump in'}
            </span>
          </div>
          <button className="btn primary" onClick={onStart} disabled={!topic.trim()}>
            {status === 'ended' ? 'Start a new meeting' : 'Start meeting'}
          </button>
          <p className="fine">
            {settings.personas.length} people at the table. Talking with {llm.label}, voices by {voice.label}
            {settings.conversation.batchSize > 1 ? `, ${settings.conversation.batchSize} lines per API call` : ''}.{' '}
            <button className="link" onClick={onOpenSettings}>
              Edit team and settings
            </button>
          </p>
        </div>
      ) : (
        <div className="in-session">
          <p className="current-topic">{meeting.topic}</p>
          <div className="meter" aria-label={`${teamTurns} of ${settings.maxTurns} lines spoken`}>
            <span style={{ width: `${Math.min(100, (teamTurns / settings.maxTurns) * 100)}%` }} />
          </div>
          <p className="fine stats">
            {settings.conversation.mode === 'mediator' ? `${host.name} is moderating. ` : ''}
            {teamTurns} of {settings.maxTurns} lines, {meeting.calls} API {meeting.calls === 1 ? 'call' : 'calls'}
            {meeting.queued ? `, ${meeting.queued} written ahead` : ''}.
          </p>
          <div className="row">
            {status === 'running' ? (
              <button className="btn primary" onClick={onPause}>
                Pause
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={onResume}>
                  Resume
                </button>
                <button className="btn" onClick={onStep}>
                  Next line
                </button>
              </>
            )}
            <button className="btn ghost" onClick={onEnd}>
              End meeting
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="msg error" role="alert">
          {error}{' '}
          {/key|Settings|model/i.test(error) && (
            <button className="link" onClick={onOpenSettings}>
              Open settings
            </button>
          )}
        </p>
      )}
      {koLoading ? (
        <p className="msg note">
          Downloading Kokoro voices{ko.totalMB ? `: ${ko.progress}%` : '…'} The browser voice speaks until they're ready.
        </p>
      ) : (
        note && !error && <p className="msg note">{note}</p>
      )}
    </section>
  )
}
