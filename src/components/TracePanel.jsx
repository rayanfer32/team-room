import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

const KIND_LABEL = {
  writer: 'Writer',
  agent: 'Agent',
  mediator: 'Mediator',
  director: 'Director',
  bid: 'Bid',
  board: 'Whiteboard',
  interview: 'Interview',
  plan: 'Questions',
  score: 'Scorecard',
}

const fmtMs = (ms) => (ms == null ? '…' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
const fmtTok = (u) => (u ? `${u.input.toLocaleString()} in, ${u.output.toLocaleString()} out` : null)
const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const pretty = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))

function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="link small-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          setDone(false)
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

function Block({ title, text, open = false, mono = true }) {
  if (text == null || text === '') return null
  const body = pretty(text)
  return (
    <details className="tblock" open={open}>
      <summary>
        <span>{title}</span>
        <span className="tblock-meta">{body.length.toLocaleString()} chars</span>
      </summary>
      <div className="tblock-body">
        <Copy text={body} />
        {mono ? <pre>{body}</pre> : <p>{body}</p>}
      </div>
    </details>
  )
}

function StatusDot({ status }) {
  return <span className={`tdot ${status}`} aria-label={status} title={status} />
}

function Detail({ e, onBack }) {
  if (!e) return <p className="tempty">Pick a call to see exactly what was sent and what came back.</p>
  const r = e.request || {}
  const meta = [
    e.provider && `${e.provider}${e.model ? ` / ${e.model}` : ''}`,
    r.route,
    r.endpoint && `endpoint: ${r.endpoint}`,
    r.maxTokens && `max ${r.maxTokens} tokens`,
    r.jsonMode != null && (r.jsonMode ? 'JSON mode' : 'plain-text mode'),
    r.reasoningEffort && `reasoning: ${r.reasoningEffort}`,
    e.finishReason && `stopped: ${e.finishReason}`,
  ].filter(Boolean)
  const all = JSON.stringify({ ...e, raw: e.raw, system: e.system, prompt: e.prompt }, null, 2)
  return (
    <div className="tdetail-inner">
      <div className="tdetail-head">
        {onBack && (
          <button className="btn ghost small tback" onClick={onBack}>
            Back
          </button>
        )}
        <div>
          <p className="tdetail-title">
            <StatusDot status={e.status} /> #{e.id} {e.label}
          </p>
          <p className="fine">
            {time(e.startedAt)}, {fmtMs(e.durationMs)}
            {e.usage ? `, ${fmtTok(e.usage)} tokens` : ''}
            {e.steps.length ? `, ${e.steps.length} tool call${e.steps.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <Copy text={all} label="Copy as JSON" />
      </div>
      {meta.length > 0 && (
        <div className="tchips">
          {meta.map((m) => (
            <span key={m} className="tchip">
              {m}
            </span>
          ))}
        </div>
      )}
      {e.error && <p className="msg error">{e.error}</p>}
      {(e.notes.length > 0 || e.retries.length > 0) && (
        <ul className="tnotes">
          {e.notes.map((n, i) => (
            <li key={`n${i}`}>{n}</li>
          ))}
          {e.retries.map((x, i) => (
            <li key={`r${i}`}>
              Retry {i + 1}: {x.code || x.status || 'network'}
              {x.wait ? `, waited ${x.wait.toFixed(1)} s` : ''}. {x.message}
            </li>
          ))}
        </ul>
      )}
      {e.steps.length > 0 && (
        <section className="tsteps">
          <h4>Tool calls</h4>
          {e.steps.map((st, i) => (
            <div key={i} className={`tstep${st.isError ? ' err' : ''}`}>
              <p className="tstep-head">
                <b>
                  {st.server} › {st.name}
                </b>
                <span className="fine">
                  {[st.persona, st.route === 'built-in' ? 'run by the provider' : 'run by the app', st.approval && `approval: ${st.approval}`, st.durationMs != null && fmtMs(st.durationMs)]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </p>
              <Block title="Arguments" text={st.args} open />
              <Block title={st.isError ? 'Error' : 'Result'} text={st.error || st.result} open={!!st.isError} />
            </div>
          ))}
        </section>
      )}
      <Block title="Parsed result" text={e.parsed} open mono />
      <Block title="Raw reply" text={e.raw} />
      <Block title="Request message" text={e.prompt} />
      <Block title="System prompt" text={e.system} />
    </div>
  )
}

export default function TracePanel({ store, open, onToggle }) {
  const { items } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [follow, setFollow] = useState(true)
  const [mobileDetail, setMobileDetail] = useState(false)

  const totals = useMemo(() => {
    let input = 0
    let output = 0
    let ms = 0
    let errors = 0
    let running = 0
    let tools = 0
    for (const e of items) {
      input += e.usage?.input || 0
      output += e.usage?.output || 0
      ms += e.durationMs || 0
      if (e.status === 'error') errors++
      if (e.status === 'running') running++
      tools += e.steps.length
    }
    return { input, output, ms, errors, running, tools }
  }, [items])

  const shown = items.filter((e) => (filter === 'problems' ? e.status === 'error' || e.retries.length || e.notes.length : filter === 'tools' ? e.steps.length : true))
  const current = items.find((e) => e.id === selected) || null

  useEffect(() => {
    if (follow && items.length) setSelected(items[items.length - 1].id)
  }, [follow, items])
  useEffect(() => {
    if (!items.length) {
      setSelected(null)
      setMobileDetail(false)
    }
  }, [items.length])

  const summary = items.length
    ? `${items.length} call${items.length === 1 ? '' : 's'}, ${(totals.input + totals.output).toLocaleString()} tokens${totals.ms ? `, ${fmtMs(totals.ms)}` : ''}${totals.tools ? `, ${totals.tools} tool use${totals.tools === 1 ? '' : 's'}` : ''}${totals.errors ? `, ${totals.errors} failed` : ''}${totals.running ? ', 1 running' : ''}`
    : 'No calls yet in this session'

  return (
    <section className={`trace panel${open ? ' open' : ''}`} aria-label="Prompt and trace inspector">
      <button className="trace-bar" onClick={onToggle} aria-expanded={open}>
        <span className="trace-title">Trace</span>
        <span className={`trace-sum${totals.errors ? ' has-err' : ''}`}>{summary}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="chev">
          <path fill="currentColor" d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z" />
        </svg>
      </button>
      {open && (
        <div className={`trace-body${mobileDetail ? ' show-detail' : ''}`}>
          <div className="trace-list">
            <div className="trace-tools">
              <div className="segmented small" role="radiogroup" aria-label="Filter calls">
                {[
                  ['all', 'All'],
                  ['problems', 'Problems'],
                  ['tools', 'Tools'],
                ].map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={filter === v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>
                    {l}
                  </button>
                ))}
              </div>
              <label className="check small">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow latest
              </label>
            </div>
            <ol className="trows">
              {shown.length === 0 && <li className="tempty">{items.length ? 'Nothing matches this filter.' : 'Start a meeting or interview, and every model call shows up here.'}</li>}
              {[...shown].reverse().map((e) => (
                <li key={e.id}>
                  <button
                    className={`trow${e.id === selected ? ' on' : ''}`}
                    onClick={() => {
                      setSelected(e.id)
                      setFollow(false)
                      setMobileDetail(true)
                    }}
                  >
                    <StatusDot status={e.status} />
                    <span className="trow-main">
                      <span className="trow-label">
                        <span className="tkind">{KIND_LABEL[e.kind] || e.kind}</span> {e.label}
                      </span>
                      <span className="trow-meta">
                        {[e.model, fmtMs(e.durationMs), e.usage && `${(e.usage.input + e.usage.output).toLocaleString()} tok`, e.steps.length && `${e.steps.length} tool`, e.retries.length && `${e.retries.length} retry`]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="trace-detail">
            <Detail e={current} onBack={mobileDetail ? () => setMobileDetail(false) : null} />
          </div>
        </div>
      )}
    </section>
  )
}
