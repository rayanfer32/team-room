import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import OfficeScene from './scene/OfficeScene'
import MeetingPanel from './components/MeetingPanel'
import Minutes from './components/Minutes'
import SayBar from './components/SayBar'
import SettingsDrawer from './components/SettingsDrawer'
import { loadSettings, saveSettings } from './lib/settings'
import { MeetingEngine, hostOf } from './lib/engine'
import { LLM_PROVIDERS } from './lib/llm'

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  useEffect(() => saveSettings(settings), [settings])

  // Shared, mutable state read every frame by the 3D characters.
  const live = useMemo(() => ({ speakingId: null, amp: 0 }), [])
  const engine = useMemo(() => new MeetingEngine({ getSettings: () => settingsRef.current, live }), [live])
  const meeting = useSyncExternalStore(engine.subscribe, engine.getState)

  const [topic, setTopic] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [minutesOpen, setMinutesOpen] = useState(() => window.innerWidth > 760)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const start = () => {
    const s = settingsRef.current
    const needsKey = LLM_PROVIDERS[s.llm.provider]?.needsKey && !s.llm.keys[s.llm.provider]
    if (needsKey) {
      setSettingsOpen(true)
      return
    }
    engine.start(topic)
  }

  const currentLine = meeting.speakingId ? meeting.transcript.findLast((l) => l.speaker === meeting.speakingId)?.text : null
  const host = hostOf(settings)

  return (
    <div className="app">
      <div className="stage">
        <OfficeScene
          personas={settings.personas}
          managerId={host.id}
          live={live}
          speakingId={meeting.speakingId}
          line={currentLine}
          topic={meeting.status === 'idle' ? topic : meeting.topic}
        />
      </div>

      <div className="hud">
        <MeetingPanel
          meeting={meeting}
          settings={settings}
          host={host}
          onSetMode={(mode) => setSettings((s) => ({ ...s, conversation: { ...s.conversation, mode } }))}
          topic={topic}
          setTopic={setTopic}
          onStart={start}
          onPause={() => engine.pause()}
          onResume={() => engine.resume()}
          onStep={() => engine.step()}
          onEnd={() => engine.end()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <Minutes meeting={meeting} personas={settings.personas} open={minutesOpen} onToggle={() => setMinutesOpen((o) => !o)} />
        <SayBar disabled={meeting.status === 'idle'} onSend={(t) => engine.interject(t)} />
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings}
        setSettings={setSettings}
        engine={engine}
        running={meeting.status === 'running'}
      />
    </div>
  )
}
