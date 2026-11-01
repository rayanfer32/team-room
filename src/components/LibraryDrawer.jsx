import { useEffect, useRef, useState } from 'react'
import { deleteSession, listSessions } from '../lib/library'

const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function LibraryDrawer({ open, onClose, onReplay, onShowScorecard, busy }) {
  const [items, setItems] = useState([])
  const [confirm, setConfirm] = useState(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setItems(listSessions())
    setConfirm(null)
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <header>
          <h2 id="library-title">Saved meetings</h2>
          <button ref={closeRef} className="btn ghost" onClick={onClose}>
            Done
          </button>
        </header>
        <p className="fine">Meetings and interviews save automatically when they end. Replays speak the saved lines again with your current voices. Up to 40 are kept in this browser.</p>
        {busy && <p className="msg note">Pause or end the current session to start a replay.</p>}
        {items.length === 0 && <p className="empty-lib">Nothing saved yet.</p>}
        <ul className="library">
          {items.map((s) => {
            const lines = s.transcript?.length || 0
            return (
              <li key={s.id}>
                <div className="lib-top">
                  <span className={`badge ${s.kind}`}>{s.kind === 'interview' ? 'Interview' : 'Meeting'}</span>
                  <span className="fine">{when(s.savedAt)}</span>
                </div>
                <p className="lib-title">{s.title}</p>
                <p className="fine">
                  {lines} lines with {s.personas?.map((p) => p.name).join(', ')}
                  {s.scorecard ? `. Score ${s.scorecard.overall}/10` : ''}
                </p>
                <div className="row">
                  <button className="btn primary small" disabled={busy || !lines} onClick={() => onReplay(s)}>
                    Replay
                  </button>
                  {s.scorecard && (
                    <button className="btn small" onClick={() => onShowScorecard(s.scorecard)}>
                      Scorecard
                    </button>
                  )}
                  {confirm === s.id ? (
                    <button
                      className="btn ghost small danger"
                      onClick={() => {
                        deleteSession(s.id)
                        setItems(listSessions())
                        setConfirm(null)
                      }}
                    >
                      Delete for good
                    </button>
                  ) : (
                    <button className="btn ghost small" onClick={() => setConfirm(s.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}
