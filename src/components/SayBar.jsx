import { useState } from 'react'

export default function SayBar({ disabled, onSend }) {
  const [text, setText] = useState('')
  const send = () => {
    if (!text.trim()) return
    onSend(text)
    setText('')
  }
  return (
    <div className="saybar panel">
      <label htmlFor="say" className="sr-only">
        Say something to the team
      </label>
      <input
        id="say"
        value={text}
        disabled={disabled}
        placeholder={disabled ? 'Start a meeting to join in' : 'Jump in: ask a question or steer the discussion'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        autoComplete="off"
      />
      <button className="btn primary" onClick={send} disabled={disabled || !text.trim()}>
        Say it
      </button>
    </div>
  )
}
