import { useEffect, useRef, useState } from 'react'
import BoardView from './BoardView'

export default function Minutes({ meeting, personas, open, onToggle, boardMode }) {
  const list = useRef(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('minutes')
  const { transcript, speaking } = meeting
  const colors = Object.fromEntries(personas.map((p) => [p.name, p.look.shirt]))

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcript.length, open, tab])

  const copy = async () => {
    const text = [`${meeting.kind === 'interview' ? 'Role' : 'Topic'}: ${meeting.topic}`, '', ...transcript.map((l) => `${l.name} (${l.role}): ${l.text}`)].join('\n')
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
    <section className={`panel minutes${open ? ' open' : ''}`} aria-label="Minutes and whiteboard">
      <header>
        <div className="tabs" role="tablist">
          {[
            ['minutes', 'Minutes', transcript.length],
            ['board', meeting.kind === 'interview' ? 'Progress' : 'Board', null],
          ].map(([key, label, count]) => (
            <button
              key={key}
              role="tab"
              aria-selected={open && tab === key}
              className={`tab${open && tab === key ? ' on' : ''}`}
              onClick={() => {
                if (open && tab === key) onToggle()
                else {
                  setTab(key)
                  if (!open) onToggle()
                }
              }}
            >
              {label}
              {count != null && <span className="count">{count}</span>}
            </button>
          ))}
        </div>
        {transcript.length > 0 && tab === 'minutes' && open && (
          <button className="link" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </header>
      {open && tab === 'minutes' && (
        <ol ref={list} className="lines">
          {transcript.length === 0 && <li className="empty">Lines appear here as people talk.</li>}
          {transcript.map((l) => (
            <li
              key={l.id}
              className={`line${l.you ? ' you' : ''}${l === last && !l.you && speaking === l.speaker ? ' live' : ''}`}
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
      {open && tab === 'board' && (
        <div className="lines">
          <BoardView meeting={meeting} boardMode={boardMode} />
        </div>
      )}
    </section>
  )
}
