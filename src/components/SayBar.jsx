import { useEffect, useRef, useState } from 'react'

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

/** Type or dictate. Dictation uses the browser's speech recognition (Chrome, Edge, Safari). */
export default function SayBar({ meeting, onSend }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState('')
  const rec = useRef(null)
  const base = useRef('')

  const { status, kind } = meeting
  const canTalk = ['running', 'paused', 'awaiting'].includes(status) || (status === 'ended' && kind === 'meeting' && meeting.transcript.length > 0)
  const awaiting = status === 'awaiting'

  const stop = () => {
    rec.current?.stop()
    setListening(false)
  }

  useEffect(() => () => rec.current?.abort(), [])
  useEffect(() => {
    if (!canTalk && listening) stop()
  }, [canTalk, listening])

  const startMic = () => {
    if (!Recognition) return
    setMicError('')
    const r = new Recognition()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'
    base.current = text ? `${text.trim()} ` : ''
    let finals = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finals += t
        else interim += t
      }
      setText(`${base.current}${finals}${interim}`.replace(/\s+/g, ' ').trimStart())
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicError('Microphone access was blocked. Allow it in your browser to dictate.')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setMicError(`Dictation stopped (${e.error}).`)
      setListening(false)
    }
    r.onend = () => setListening(false)
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const send = () => {
    if (!text.trim()) return
    stop()
    onSend(text)
    setText('')
  }

  const placeholder = !canTalk
    ? kind === 'interview' && status === 'ended'
      ? 'Interview finished'
      : status === 'idle'
        ? 'Start a meeting or interview to join in'
        : 'Start a meeting to join in'
    : kind === 'interview'
      ? awaiting
        ? 'Type or speak your answer'
        : 'The panel is talking. Answer whenever you are ready'
      : 'Jump in: ask a question or steer the discussion'

  return (
    <div className={`saybar panel${awaiting ? ' awaiting' : ''}${listening ? ' listening' : ''}`}>
      {micError && <p className="mic-error">{micError}</p>}
      <label htmlFor="say" className="sr-only">
        {kind === 'interview' ? 'Your answer' : 'Say something to the team'}
      </label>
      {Recognition && (
        <button
          className={`mic${listening ? ' on' : ''}`}
          onClick={listening ? stop : startMic}
          disabled={!canTalk}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictation' : 'Dictate with the microphone'}
          title={listening ? 'Stop dictation' : 'Speak instead of typing'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" />
          </svg>
        </button>
      )}
      <input
        id="say"
        value={text}
        disabled={!canTalk}
        placeholder={listening ? 'Listening…' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        autoComplete="off"
      />
      <button className="btn primary" onClick={send} disabled={!canTalk || !text.trim()}>
        {kind === 'interview' ? 'Answer' : 'Say it'}
      </button>
    </div>
  )
}
