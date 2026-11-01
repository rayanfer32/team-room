import { useCallback, useMemo, useRef, useState, useSyncExternalStore, useEffect } from 'react'
import OfficeScene from './scene/OfficeScene'
import MeetingPanel from './components/MeetingPanel'
import Minutes from './components/Minutes'
import SayBar from './components/SayBar'
import SettingsDrawer from './components/SettingsDrawer'
import LibraryDrawer from './components/LibraryDrawer'
import Scorecard from './components/Scorecard'
import TracePanel from './components/TracePanel'
import { loadSettings, saveSettings } from './lib/settings'
import { MeetingEngine, castOf, findManager, hostOf, teamProblem } from './lib/engine'
import { setConnectionMode } from './lib/services'
import { LLM_PROVIDERS } from './lib/llm'

const LIVE = ['running', 'paused', 'awaiting', 'replaying', 'replayPaused']

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  useEffect(() => saveSettings(settings), [settings])
  setConnectionMode(settings.connection, settings.workerUrl)

  /** Edit a deep copy of settings in place: update((s) => (s.a.b = 1)). */
  const update = useCallback(
    (fn) =>
      setSettings((s) => {
        const next = JSON.parse(JSON.stringify(s))
        fn(next)
        return next
      }),
    [],
  )

  // Shared, mutable state read every frame by the 3D characters.
  const live = useMemo(() => ({ speaking: null, focus: null, amp: 0 }), [])
  const engine = useMemo(() => new MeetingEngine({ getSettings: () => settingsRef.current, live }), [live])
  const meeting = useSyncExternalStore(engine.subscribe, engine.getState)
  // Let the engine save tool policies ("Always allow") and refreshed OAuth tokens.
  engine.setToolPolicy = (serverId, name, policy) =>
    update((s) => {
      const t = s.mcp.servers.find((x) => x.id === serverId)?.tools?.find((x) => x.name === name)
      if (t) t.policy = policy
    })
  engine.updateServer = (serverId, patch) =>
    update((s) => {
      const sv = s.mcp.servers.find((x) => x.id === serverId)
      if (sv) Object.assign(sv, patch)
    })

  const [topic, setTopic] = useState('')
  // false, or { tab, people } saying where the drawer should open
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback((tab, people) => setSettingsOpen({ tab, people }), [])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [scorecard, setScorecard] = useState(null)
  const [minutesOpen, setMinutesOpen] = useState(() => window.innerWidth > 760)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const closeLibrary = useCallback(() => setLibraryOpen(false), [])
  const closeScorecard = useCallback(() => setScorecard(null), [])

  // Pop the scorecard open when an interview has just been scored.
  const lastCard = useRef(null)
  useEffect(() => {
    if (meeting.scorecard && meeting.scorecard !== lastCard.current && meeting.status === 'ended' && !meeting.replay) {
      lastCard.current = meeting.scorecard
      setScorecard(meeting.scorecard)
    }
  }, [meeting.scorecard, meeting.status, meeting.replay])

  const ready = (people) => {
    const s = settingsRef.current
    const needsKey = LLM_PROVIDERS[s.llm.provider]?.needsKey && !s.llm.keys[s.llm.provider]
    if (needsKey) {
      openSettings('model')
      return false
    }
    if (teamProblem(people)) {
      openSettings('people', people === s.personas ? 'team' : 'panel')
      return false
    }
    return true
  }
  const start = () => ready(settingsRef.current.personas) && engine.start(topic)
  const startInterview = () => ready(settingsRef.current.interview.panel) && engine.startInterview()

  // What the room shows: a replay's saved cast, the live session, or whatever is being set up.
  const viewKind = LIVE.includes(meeting.status) ? meeting.kind : settings.session.kind
  const cast = meeting.cast && LIVE.includes(meeting.status) ? meeting.cast : castOf(settings, viewKind)
  const host = meeting.cast && LIVE.includes(meeting.status) ? findManager(cast) : hostOf(settings, viewKind)
  const currentLine = meeting.speaking ? meeting.transcript.findLast((l) => !l.you && l.speaker === meeting.speaking)?.text : null
  const showSession = meeting.status !== 'idle' && (LIVE.includes(meeting.status) || meeting.kind === viewKind)

  const boardView = {
    kind: viewKind,
    title: showSession ? meeting.topic : viewKind === 'interview' ? settings.interview.role : topic,
    board: showSession ? meeting.board : null,
    agenda: showSession ? meeting.agenda : null,
    interview: showSession ? meeting.interview : null,
  }

  return (
    <div className={`app${settings.traceOpen ? ' trace-open' : ''}`}>
      <div className="stage">
        <OfficeScene
          personas={cast}
          hostName={host.name}
          candidate={viewKind === 'interview'}
          live={live}
          speaking={meeting.speaking}
          line={currentLine}
          boardView={boardView}
        />
      </div>

      <div className="hud">
        <MeetingPanel
          meeting={meeting}
          settings={settings}
          update={update}
          host={host}
          engine={engine}
          topic={topic}
          setTopic={setTopic}
          onStart={start}
          onStartInterview={startInterview}
          onOpenSettings={openSettings}
          onOpenLibrary={() => setLibraryOpen(true)}
          onShowScorecard={setScorecard}
        />
        <Minutes meeting={meeting} personas={cast} open={minutesOpen} onToggle={() => setMinutesOpen((o) => !o)} boardMode={settings.board.mode} />
        <SayBar meeting={meeting} onSend={(t) => engine.interject(t)} />
      </div>

      <SettingsDrawer
        open={!!settingsOpen}
        initialTab={settingsOpen?.tab}
        initialPeople={settingsOpen?.people}
        onClose={closeSettings}
        settings={settings}
        setSettings={setSettings}
        engine={engine}
        running={['running', 'awaiting', 'replaying'].includes(meeting.status)}
        topic={meeting.status === 'idle' || meeting.status === 'ended' ? topic : meeting.topic}
      />
      <LibraryDrawer
        open={libraryOpen}
        onClose={closeLibrary}
        busy={['running', 'awaiting'].includes(meeting.status)}
        onShowScorecard={setScorecard}
        onReplay={(session) => {
          setLibraryOpen(false)
          setMinutesOpen(true)
          engine.startReplay(session)
        }}
      />
      <Scorecard card={scorecard} onClose={closeScorecard} />
      <TracePanel store={engine.traces} open={settings.traceOpen} onToggle={() => update((s) => (s.traceOpen = !s.traceOpen))} />
    </div>
  )
}
