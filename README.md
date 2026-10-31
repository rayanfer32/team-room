# Team Room

A cozy low-poly office in Three.js where five AI teammates hold a live meeting on any topic you type. They speak out loud, look at whoever is talking, and you can jump in at any time to ask a question or steer the discussion.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, click the gear icon, and add a key for the model you want. Type a topic (or tap an example) and press **Start meeting**.

All API calls go through Vite's local proxy (see `vite.config.js`). That avoids browser CORS limits, so always run it with `npm run dev` or `npm run build && npm run preview`. Opening `dist/index.html` directly or hosting it as a static site will not reach the APIs.

## Conversation models

| Provider | Key | Default model | Get a key |
|---|---|---|---|
| Groq | Free tier | `llama-3.3-70b-versatile` | console.groq.com/keys |
| Gemini | Free tier | `gemini-2.5-flash` | aistudio.google.com/apikey |
| Claude | Paid API key | `claude-haiku-5-5` | console.anthropic.com |
| Ollama | None | `llama3.2` | Install Ollama, then `ollama pull llama3.2` |

Model names are editable in Settings, so you can switch whenever a provider renames or retires a model. If Ollama runs somewhere other than `http://127.0.0.1:11434`, copy `.env.example` to `.env` and set `OLLAMA_URL`.

## Voices

You can pick ElevenLabs, Fish Audio or the browser's built-in voice. If the cloud voice has no key, runs out of quota, or errors, the browser voice takes over automatically for the rest of the meeting, and a note explains why.

ElevenLabs comes with a default premade voice ID for each person, and you can change them under Settings, then Team. For Fish Audio, paste a voice model ID from fish.audio for each person; with no ID, it uses Fish's default voice. You can also choose a specific browser voice, pitch and speed per person, and use the **Hear** button to preview.

## How the meeting works

- **Who speaks next:** each turn, the model receives the team, the topic and the recent transcript, and returns `{ "speaker", "text" }`. The model picks the speaker based on who was addressed and whose expertise fits. The manager opens the meeting, starts converging near the end, and closes with decisions and owners.
- **Smooth pacing:** while one person speaks, the next line and its audio are already being prepared.
- **Joining in:** sending a message stops the current speaker and cancels anything prepared. The most relevant teammate answers you next. This works whether the meeting is running or paused.
- **Controls:** you can pause the meeting, step one line at a time, or end it. **Copy** in Minutes puts the full transcript on your clipboard.

## Project layout

```
src/
  data/personas.js       default team and example topics
  lib/llm.js             Claude, Groq, Gemini, Ollama adapters
  lib/tts.js             ElevenLabs, Fish Audio, browser speech, lip-sync amplitude
  lib/engine.js          meeting loop: prompting, turn-taking, interruptions, prefetch
  lib/settings.js        settings saved in localStorage
  scene/OfficeScene.jsx  canvas, lights, camera, seating
  scene/Office.jsx       room, furniture, plants, whiteboard showing the topic
  scene/Person.jsx       low-poly character with idle, listening and talking motion
  components/            meeting panel, minutes, say bar, settings drawer
```

## Privacy note

API keys are stored in your browser's localStorage and sent only to the provider through your local dev server. Don't deploy this as a public site with your keys inside.
