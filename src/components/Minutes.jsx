import { useEffect, useRef, useState } from 'react'

export default function Minutes({ meeting, personas, open, onToggle }) {
  const list = useRef(null)
  const [copied, setCopied] = useState(false)
  const { transcript, speakingId } = meeting
  const colors = Object.fromEntries(personas.map((p) => [p.id, p.look.shirt]))

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcript.length, open])

  const copy = async () => {
    const text = [`Topic: ${meeting.topic}`, '', ...transcript.map((l) => `${l.name} (${l.role}): ${l.text}`)].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const last = transcript.at(-1)
  return (
    <section className={`panel minutes${open ? ' open' : ''}`} aria-label="Meeting minutes">
      <header>
        <button className="minutes-toggle" onClick={onToggle} aria-expanded={open}>
          <h2>Minutes</h2>
          <span className="count">{transcript.length}</span>
        </button>
        {transcript.length > 0 && (
          <button className="link" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </header>
      {open && (
        <ol ref={list} className="lines">
          {transcript.length === 0 && <li className="empty">Lines appear here as the team talks. Start a meeting to begin.</li>}
          {transcript.map((l) => (
            <li
              key={l.id}
              className={`line${l.speaker === 'you' ? ' you' : ''}${l === last && speakingId === l.speaker ? ' live' : ''}`}
              style={{ '--c': colors[l.speaker] || '#f2b134' }}
            >
              <p className="who">
                <b>{l.name}</b> <span>{l.role}</span>
              </p>
              <p className="said">{l.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
