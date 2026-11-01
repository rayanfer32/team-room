import { useEffect, useRef, useState } from 'react'

function Score({ value }) {
  return (
    <span className="score" style={{ '--p': `${value * 10}%` }} aria-label={`${value} out of 10`}>
      <span className="bar" />
      <b>{value}</b>/10
    </span>
  )
}

export default function Scorecard({ card, onClose }) {
  const closeRef = useRef(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!card) return
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, onClose])
  if (!card) return null

  const copy = async () => {
    const text = [
      `Overall: ${card.overall}/10 ${card.verdict ? `(${card.verdict})` : ''}`,
      card.summary,
      '',
      'Strengths:',
      ...card.strengths.map((s) => `- ${s}`),
      '',
      'To improve:',
      ...card.improvements.map((s) => `- ${s}`),
      '',
      ...card.answers.flatMap((a, i) => [`Q${i + 1}. ${a.question} (${a.score}/10)`, `Feedback: ${a.feedback}`, `Stronger answer: ${a.stronger}`, '']),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="score-title">
        <header>
          <h2 id="score-title">Your scorecard</h2>
          <div className="row">
            <button className="btn ghost" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button ref={closeRef} className="btn ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="overall">
          <span className="big">{card.overall}</span>
          <span className="of">/10</span>
          {card.verdict && <span className="verdict">{card.verdict}</span>}
        </div>
        {card.summary && <p className="summary">{card.summary}</p>}
        <div className="two-col">
          {card.strengths.length > 0 && (
            <section>
              <h3>Strengths</h3>
              <ul>
                {card.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          {card.improvements.length > 0 && (
            <section>
              <h3>To improve</h3>
              <ul>
                {card.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {card.answers.length > 0 && (
          <section>
            <h3>Answer by answer</h3>
            <ol className="answers">
              {card.answers.map((a, i) => (
                <li key={i}>
                  <div className="q-row">
                    <p className="q">{a.question}</p>
                    <Score value={a.score} />
                  </div>
                  {a.feedback && <p>{a.feedback}</p>}
                  {a.stronger && (
                    <p className="stronger">
                      <b>A stronger answer:</b> {a.stronger}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}
