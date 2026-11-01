# Team Room

A cozy office in Three.js where AI teammates hold a live, spoken meeting on any topic you type. You can jump in at any time, follow an agenda, and watch decisions land on a live whiteboard. The same room runs **mock interviews**: a panel asks you questions from your own question bank or a job description, you answer by typing or speaking, and you get a scorecard at the end. Every session is saved so you can replay it.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, click the gear icon, and add a key for the model you want. Type a topic (or tap an example) and press **Start meeting**.

### Settings

Settings is split into six tabs:
- **Model:** provider, key, model and Groq reasoning effort.
- **Voices:** provider, keys and Kokoro.
- **Conversation:** style, who writes the lines, turn-taking, the whiteboard and meeting length.
- **People:** your team and the interview panel, switched at the top.
- **Prompts:** filtered by group, with a preview.
- **Connection.**

A red dot marks a tab that needs attention, such as a missing key or a duplicate name. Links in the app open the right tab directly, and the drawer remembers the last tab you used.

### Connection

Settings has one **Connection** switch for every provider:

- **Proxy on this site (default):** calls go to `/proxy` on the same site. Locally, that's Vite's dev server (`npm run dev` or `npm run build && npm run preview`). When the site is deployed on the Cloudflare Worker, that's the Worker. No CORS problems with any provider.
- **Cloudflare Worker:** calls go through your Worker at another address, for example when you run the site locally but want to test the deployed relay.
- **Direct:** the browser calls each API itself, so a static build (`dist/`) works on any host. Some providers refuse calls from web pages (CORS). If you see a "couldn't reach" error, use a proxy. For Ollama, start it with `OLLAMA_ORIGINS="*"`.

### Deploying on Cloudflare

The `worker/` folder deploys the whole app to Cloudflare Workers in one step. The site is served as static assets, and `/proxy/*` is relayed to the providers.

```bash
cd worker
npm install
npx wrangler login
npm run deploy        # builds the site, then deploys
```

API keys stay in the browser. They travel in each request's headers and the Worker only relays them, without storing or logging anything. By default the relay only accepts calls from the site it serves. To use it from somewhere else, such as `http://localhost:5173` with Connection set to Cloudflare Worker, add that origin to `ALLOWED_ORIGINS` in `worker/wrangler.toml`. Avoid `"*"` on a public Worker. A Worker can't reach Ollama on your computer, so use Proxy or Direct for Ollama. `npm run dev` inside `worker/` runs it locally with `wrangler dev`.

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

## Mock interviews

Switch the panel to **Mock interview**, enter the role and choose where questions come from:

- **My bank:** upload `.txt`, `.md`, `.csv`, `.json` or `.html` files, including your HTML study guides. Questions are extracted automatically, and you can edit the list.
- **Job description:** paste it, and one API call prepares role-specific questions.
- **Both:** the two sources alternate.

The panel defaults to Anita (Hiring Manager), Karthik (Tech Lead) and Joanna (HR Partner), and is editable under Settings, then Interview panel. Your empty chair faces them and lights up when it's your turn.
- **Answering:** type your answer, or press the microphone to dictate using the browser's speech recognition (Chrome, Edge and Safari).
- **Follow-ups:** each answer can get 0 to 2 follow-up questions.
- **Skipping:** you can skip any question.
- **Scorecard:** at the end you get an overall score and verdict, strengths, things to improve, and for each answer a score, feedback and an outline of a stronger answer.

## Save and replay

Meetings and interviews save automatically when they end, and you can also press **Save** at any time. Open **Saved meetings** (the bookmark icon) to replay one. Replays speak the saved text again with your current voice settings, so no audio is stored. You can pause, go back, go forward and stop, and the whiteboard and progress follow along. Up to 40 sessions are kept in this browser.

## Agenda mode

Tick **Follow an agenda**, write one item per line, and set how many lines each item gets. The host opens, moves the meeting on when an item's time is up, and closes. The current item shows on the panel, the Board tab and the 3D whiteboard.

## Live whiteboard

The whiteboard on the wall, and the **Board** tab next to Minutes, collect decisions, action items with owners, and open questions. Choose how it updates in Settings:
- **In each reply:** the model adds new items as part of its normal reply, with no extra calls.
- **Summary call:** a separate call rewrites the whole board every few lines and once at the end.
- **Off.**

## One writer or one agent per person

- **One writer (default):** a single model writes every line, optionally several lines per call.
- **One agent per person:** each person has their own prompt, private notes that carry through the meeting, and optionally their own model and provider (set under Team). The next speaker is chosen by one of three methods:
  - **Director:** a separate call picks who speaks, then that person's agent talks. Two calls per line.
  - **Bids:** everyone except the last speaker bids in parallel with how much they want to speak and what they'd say, and the highest bid is spoken. One call per bidder per line.
  - **Mediator agent:** the mediator's agent speaks and names who goes next. One call per line.

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

## Trace inspector

The **Trace** bar along the bottom summarises the current session: calls, tokens, time, tool uses and failures. Expand it to see every model call. That covers writer, agent, mediator, director and bid calls, plus whiteboard summaries, interview questions and scorecards. Filter by All, Problems or Tools. **Follow latest** keeps the newest call selected.

Each call shows:
- **Settings used:** provider and model, whether tools ran in the app or at the provider, the token limit, JSON or plain-text mode, reasoning effort and why the model stopped.
- **What happened:** duration, input and output tokens, retries and notes (for example "JSON mode failed; repeated in plain-text mode").
- **Tool calls:** the server and tool, who used it, how it ran, the approval decision, arguments, result and timing.
- **Exact text:** the parsed result, the raw reply, the request message and the full system prompt, each with a Copy button, plus **Copy as JSON** for the whole call.

Traces are kept in memory for the current session only and cleared when a new one starts. API keys are never recorded.

## MCP tools

Under **Settings → Tools**, add Model Context Protocol servers by URL. Each one gets:
- **Authentication:** None, a Token (any header, with "Bearer " added for Authorization), or OAuth sign-in.
- **Connect and load tools:** shows each tool with a policy of Automatic, Ask me or Off. Read-only tools (`readOnlyHint`) default to Automatic and everything else to Ask me.
- **Who runs the tools:** "Provider when possible" or "Always this app".

Then, under **People**, tick which tools each teammate or panelist can use.

**Protocol:** servers must speak Streamable HTTP. The client tries the current revision (2026-07-28: no sessions, `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, and `Mcp-Param-*` for `x-mcp-header` parameters). If the server is older, it falls back to the initialize-and-session handshake (2025-03-26 to 2025-11-25), as the spec recommends. JSON and event-stream replies both work. The deprecated HTTP+SSE transport isn't supported in the app, and command-line (stdio) servers need an HTTP bridge.

**OAuth sign-in:**
1. The client finds the server's protected resource metadata, from `WWW-Authenticate` or the well-known URLs.
2. It finds the authorization server's metadata, using OAuth or OpenID discovery.
3. It registers the app in the spec's order: a client ID you paste, then a Client ID Metadata Document, then Dynamic Client Registration.
4. A sign-in window opens using PKCE (S256), the `resource` indicator and an issuer check.
5. Tokens are stored in this browser and refreshed automatically.

Client ID Metadata Documents only work when the site is public over https, such as on the Cloudflare Worker, which serves `/oauth/client-metadata.json`. Register `…/oauth-callback.html` as the redirect URL if you pre-register an app.

**Who runs a call:**
- **App-run (any model with tool calling):** the app sends the tools to Claude, Groq, Gemini or Ollama, runs each call against the MCP server, and loops for up to 4 rounds. ChatJimmy can't call tools.
- **Provider-run (Claude and Groq):** Claude's MCP connector or Groq's remote MCP calls the server directly. The app only uses this for a single person's call, a public https server, and tools that run without asking. The provider can't pause for your approval, so anything set to "Ask me" always runs in the app.

**Permissions:** in the one-writer engine, each tool gets a required `_speaker` field limited to the people allowed to use it, and the app rejects calls for anyone else. In agent mode, each person's own call only gets their tools. Bids, director, whiteboard summaries, question planning and scoring never get tools.

**Approvals:** a tool set to "Ask me" pauses that line and shows an approval card with the arguments. The choices are **Allow once**, **Always allow** (which switches the tool to Automatic) or **Deny**, and the model is told it was declined. Interrupting or ending the session cancels any pending approval.

**Relays:** in Proxy and Worker connection modes, MCP and OAuth requests go through `/proxy/any`, a relay that takes the target in an `X-Target-URL` header. The Worker version only relays to https URLs and lets the browser read `Mcp-Session-Id` and `WWW-Authenticate`.

## When a model call fails

Every provider goes through the same error handling (`src/lib/llm.js`):

- **Rate limits (429):** retried up to twice, after the wait the provider asks for (up to 20 seconds). Daily limits aren't retried, because waiting won't help.
- **Server or capacity errors (5xx, Groq 498):** retried twice, after 1.5 and then 4 seconds. A dropped connection is retried once.
- **Groq `json_validate_failed`:** if Groq returns the model's partial output (`failed_generation`), it is read directly. If it returns nothing, the request is repeated once without JSON mode and with more room, since the reply reader handles plain text too.
- **Groq gpt-oss models:** these think before answering, and the thinking counts against the token limit. Requests send `reasoning_effort` (Low by default, changeable in Settings) and `include_reasoning: false`, and add a thinking budget on top of the answer budget. An empty reply cut off by the length limit is retried with twice the room.
- **Messages:** anything left over becomes a plain explanation, covering a rejected key, an unknown or retired model, a request too long for the model, rate or daily limits, and outages. The provider's own wording is kept in brackets for debugging.

While a retry is happening, the panel shows a short note, and the API-call counter includes retries.

## Project layout

```
src/
  data/personas.js       default team and example topics
  lib/llm.js             Claude, Groq, Gemini, Ollama, ChatJimmy adapters
  lib/tts.js             ElevenLabs, Fish Audio, Kokoro, browser speech, lip-sync amplitude
  lib/kokoro.js          Kokoro client: voice list, download progress, requests to the worker
  lib/kokoro.worker.js   runs kokoro-js (ONNX) off the main thread
  lib/engine.js          sessions: meetings (writer or agents), interviews, replay, saving
  lib/parse.js           reading model replies (JSON, scripts, plain speech)
  lib/board.js           whiteboard merging and summaries
  lib/agenda.js          agenda timing
  lib/library.js         saved sessions
  lib/questions.js       pulling questions out of uploaded files
  lib/prompts.js         every prompt template and how they're assembled
  lib/mcp.js             MCP client: modern and legacy Streamable HTTP, headers, SSE, results
  lib/oauth.js           MCP OAuth: discovery, registration, PKCE, sign-in window, refresh
  lib/tools.js           which tools each call gets, writer-mode permissions, built-in eligibility
  lib/trace.js           in-memory trace store for the inspector
  lib/services.js        API server addresses and the proxy/direct switch
  lib/settings.js        settings saved in localStorage
  scene/OfficeScene.jsx  canvas, lights, camera, seating
  scene/Office.jsx       room, furniture, plants, whiteboard showing the topic
  scene/Person.jsx       low-poly character with idle, listening and talking motion
  components/            panel, minutes and board, say bar with dictation, settings, tools, library, scorecard, trace panel
public/oauth-callback.html   finishes OAuth sign-in in the pop-up window
worker/
  src/index.js           Cloudflare Worker: serves the site and relays /proxy/*
  wrangler.toml          deploy config, including ALLOWED_ORIGINS
```

## Privacy note

API keys are stored in your browser's localStorage and sent only to the provider through your local dev server. Don't deploy this as a public site with your keys inside.
