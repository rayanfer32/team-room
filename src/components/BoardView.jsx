import { boardIsEmpty } from '../lib/board'

/** The whiteboard as readable HTML (the 3D board shows the same thing). */
export default function BoardView({ meeting, boardMode }) {
  const { board, agenda, interview, kind } = meeting
  return (
    <div className="boardview">
      {agenda && (
        <section>
          <h3>Agenda</h3>
          <ol className="agenda-list">
            {agenda.items.map((it, i) => (
              <li key={i} className={i === agenda.index ? 'now' : i < agenda.index ? 'done' : ''}>
                {it}
              </li>
            ))}
          </ol>
        </section>
      )}
      {kind === 'interview' && interview?.questions && (
        <section>
          <h3>Questions</h3>
          <ol className="agenda-list">
            {interview.questions.map((q, i) => (
              <li key={i} className={i + 1 === interview.asked ? 'now' : i + 1 < interview.asked ? 'done' : ''}>
                {i < interview.asked ? q : 'Not asked yet'}
              </li>
            ))}
          </ol>
        </section>
      )}
      {kind === 'meeting' &&
        (boardIsEmpty(board) ? (
          <p className="empty">
            {boardMode === 'off' ? 'The whiteboard is off. Turn it on in Settings.' : 'Decisions, action items and open questions appear here as the team talks.'}
          </p>
        ) : (
          <>
            {board.decisions.length > 0 && (
              <section>
                <h3>Decisions</h3>
                <ul>
                  {board.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </section>
            )}
            {board.actions.length > 0 && (
              <section>
                <h3>Action items</h3>
                <ul>
                  {board.actions.map((a, i) => (
                    <li key={i}>
                      {a.task}
                      {a.owner && <span className="owner"> {a.owner}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {board.questions.length > 0 && (
              <section>
                <h3>Open questions</h3>
                <ul>
                  {board.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ))}
    </div>
  )
}
