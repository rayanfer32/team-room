# Team Room

A cozy low-poly office in Three.js where five AI teammates hold a live meeting on any topic you type. They speak out loud, look at whoever is talking, and you can jump in at any time to ask a question or steer the discussion.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, click the gear icon, and add a key for the model you want. Type a topic (or tap an example) and press **Start meeting**.

### Connection: proxy or direct

Settings has one **Connection** switch for every provider:

- **Proxy (default):** calls go through Vite's local server (`npm run dev` or `npm run build && npm run preview`). This avoids browser CORS blocks for every provider.
- **Direct from browser:** the browser calls each API itself, so a static build (`dist/`) works on any host. Some providers refuse calls from web pages (CORS). If you see a "couldn't reach" error, switch back to Proxy. For Ollama, start it with `OLLAMA_ORIGINS="*"`.

The server addresses live in one file, `src/lib/services.js`, which both modes read.

## Conversation models

| Provider | Key | Default model | Get a key |
|---|---|---|---|
| Groq | Free tier | `llama-3.3-70b-versatile` | console.groq.com/keys |
| Gemini | Free tier | `gemini-2.5-flash` | aistudio.google.com/apikey |
| Claude | Paid API key | `claude-haiku-5-5` | console.anthropic.com |
| Ollama | None | `llama3.2` | Install Ollama, then `ollama pull llama3.2` |
| ChatJimmy | None | `llama3.1-8B` | Free public service at chatjimmy.ai |

ChatJimmy has no official API. The app calls the same `/api/chat` endpoint its website uses and strips the `<|stats|>` block from replies, so it may slow down, rate-limit or change without notice. Small 8B models often ignore the reply format. The app handles this by reading `Name: line` replies, cutting multi-speaker scripts to one speaker, removing stage directions like "(laughs)", and trimming long answers.

Model names are editable in Settings, so you can switch whenever a provider renames or retires a model. If Ollama runs somewhere other than `http://127.0.0.1:11434`, copy `.env.example` to `.env` and set `OLLAMA_URL`.

## Voices

You can pick ElevenLabs, Fish Audio, Kokoro or the browser's built-in voice. If the cloud voice has no key, runs out of quota, or errors, the browser voice takes over automatically for the rest of the meeting, and a note explains why.

**Kokoro** runs entirely in your browser, so it needs no key and has no quota. It runs in a Web Worker, so generating speech doesn't stutter the 3D scene. The model downloads once from huggingface.co and the browser caches it. That's about 90 MB for CPU (q8) and more for GPU (fp32, WebGPU). Choose Auto, GPU or CPU in Settings. GPU is much faster where WebGPU is supported, such as recent Chrome and Edge. Until the model is ready, the browser voice speaks so the meeting can start right away. Each person has their own Kokoro voice from the 28 English voices, set under Team.

ElevenLabs comes with a default premade voice ID for each person, and you can change them under Settings, then Team. For Fish Audio, paste a voice model ID from fish.audio for each person; with no ID, it uses Fish's default voice. You can also choose a specific browser voice, pitch and speed per person, and use the **Hear** button to preview.

## How the meeting works

**Conversation style** (switch on the main panel or in Settings):
- **Free flow:** anyone jumps in when the discussion calls for them.
- **Mediator:** one person frames each question, invites colleagues by name and keeps the meeting moving. The mediator defaults to whoever has a manager or lead role, and you can pick anyone in Settings.

**Lines per API call** (Settings, 1 to 10): the model can write several upcoming lines in a single request, which helps with free-tier rate limits. For example, 24 lines at 4 per call is about 6 calls instead of 24. The panel shows how many calls were made and how many lines are written ahead. When you jump in, the pre-written lines are dropped so the team responds to you.

**Team:** add or remove people under Settings, then Team, with 2 to 8 seats. The table and rug grow to fit. Each person has editable skin, hair, clothes, hair style, glasses and beard.


- **Who speaks next:** each call, the model receives the team, the topic and the recent transcript, and returns `{ "speaker", "text" }` (or `{ "lines": [...] }` when writing several lines at once). The model picks the speaker based on who was addressed and whose expertise fits. The manager opens the meeting, starts converging near the end, and closes with decisions and owners.
- **Smooth pacing:** while one person speaks, the next line and its audio are already being prepared.
- **Joining in:** sending a message stops the current speaker and cancels anything prepared. The most relevant teammate answers you next. This works whether the meeting is running or paused.
- **Controls:** you can pause the meeting, step one line at a time, or end it. **Copy** in Minutes puts the full transcript on your clipboard.

## Prompts

Settings has a **Prompts** section where every piece of text sent to the model is editable:
- The main system prompt, and how each team member is described.
- The free-flow and mediator rules, and how people talk.
- The reply formats, for one line and for several lines per call.
- The request message and transcript lines.
- The meeting moments: opening, after you jump in, mediator stepping back in, nearly out of time, closing, and the middle of the meeting.

Each part lists the placeholders it accepts, such as `{topic}`, `{host}`, `{team}` and `{lineCount}`. Parts you've changed are marked "edited", and each can be reset on its own. A preview shows the fully assembled prompt for the current team. If you edit the reply format, keep a `speaker` (the person's name) and `text`, or `Name: line` text, so replies can still be read.

## People are identified by name

There are no fixed IDs. Each person's name identifies them in prompts, model replies, the transcript, seating and the mediator choice. Names must therefore be unique and can't be "You", and Settings warns you if they aren't. Renaming the mediator keeps them as mediator.

## Project layout

```
src/
  data/personas.js       default team and example topics
  lib/llm.js             Claude, Groq, Gemini, Ollama, ChatJimmy adapters
  lib/tts.js             ElevenLabs, Fish Audio, Kokoro, browser speech, lip-sync amplitude
  lib/kokoro.js          Kokoro client: voice list, download progress, requests to the worker
  lib/kokoro.worker.js   runs kokoro-js (ONNX) off the main thread
  lib/engine.js          meeting loop: turn-taking, reply parsing, interruptions, prefetch
  lib/prompts.js         every prompt template and how they're assembled
  lib/services.js        API server addresses and the proxy/direct switch
  lib/settings.js        settings saved in localStorage
  scene/OfficeScene.jsx  canvas, lights, camera, seating
  scene/Office.jsx       room, furniture, plants, whiteboard showing the topic
  scene/Person.jsx       low-poly character with idle, listening and talking motion
  components/            meeting panel, minutes, say bar, settings drawer
```

## Privacy note

API keys are stored in your browser's localStorage and sent only to the provider through your local dev server. Don't deploy this as a public site with your keys inside.
