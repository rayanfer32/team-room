// Every piece of text sent to the model. All of it is editable in Settings → Prompts.
// Placeholders look like {name}. Unknown placeholders are left as they are.

export const DEFAULT_PROMPTS = {
  /* ---------- one writer voices everyone ---------- */
  system: `You write a live, realistic meeting between {teamSize} colleagues sitting around a table in a cozy office. Each line is spoken by exactly ONE person.

The team:
{team}

Meeting topic: "{topic}"

{agenda}

{flow}

{style}

{board}

{format}
`,

  teamMember: `- {name}, {role}. {traits}`,

  flowFreeflow: `Format: a free-flowing discussion. Anyone can jump in. Pick who speaks next by natural meeting flow: whoever was just addressed or asked a question, whoever's expertise matters most for the point on the table, or whoever would genuinely react. Don't pick the person who spoke last unless they were asked something directly. Over the meeting everyone should contribute.`,

  flowMediator: `Format: a moderated meeting. {host} is the mediator. {host} frames each question, invites a specific colleague by name, and after one or two answers summarises briefly or moves to the next point, making sure everyone is heard. Others speak only when invited, or to respond directly to the person who just spoke. {host} speaks about every second or third line.`,

  style: `How they talk:
- Each line is 1 to 3 short spoken sentences, under 55 words. It is read aloud: no markdown, lists, emojis, stage directions or name prefixes.
- Stay in character and use colleagues' names now and then. Move the discussion forward: raise concrete risks, propose specific ideas, ask pointed questions, disagree respectfully, reach decisions.
- Be concrete about the topic, like people who actually build this product. Don't repeat points already made.
- "You" is a human stakeholder who joined the meeting. When You has just spoken, the most relevant person answers You directly.`,

  formatSingle: `Reply with only a JSON object and nothing else: {"speaker":"<the person's name>","text":"<spoken words>"}`,

  formatBatch: `Reply with only a JSON object and nothing else: {"lines":[{"speaker":"<the person's name>","text":"<spoken words>"}, ...]} with exactly {lineCount} lines in speaking order. Consecutive lines should come from different people.`,

  user: `{transcript}

{phases}

{ask}`,

  transcriptLine: `{name} ({role}): {text}`,
  transcriptIntro: `Transcript so far:`,
  transcriptEmpty: `The meeting is just starting. Nobody has spoken yet.`,
  askSingle: `Who speaks next, and what do they say? JSON only.`,
  askBatch: `Write the next {lineCount} lines of the meeting. JSON only.`,

  opening: `{lineRef} is {host} ({hostRole}) opening the meeting: a quick hello, the topic, and what the team needs to decide today.`,
  replyToYou: `You (the stakeholder) just spoke. {lineRef} answers You directly, from the most relevant person.`,
  mediatorNudge: `{lineRef} is {host}, the mediator, reacting briefly and inviting the next person or moving to the next point.`,
  converge: `Time is almost up. Start converging: settle open questions and agree on decisions, owners and next steps.`,
  closing: `{lineRef} is the final line of the meeting, spoken by {host}: the decisions made, who owns which next step, then thanks to everyone. Up to 4 sentences. Any lines before it converge toward those decisions.`,
  keepGoing: `Keep the discussion moving naturally.`,

  /* ---------- agenda ---------- */
  agendaBlock: `Agenda (cover the items in this order):
{agendaList}`,
  agendaItem: `{n}. {item}`,
  agendaCurrent: `Current agenda item: "{item}" (item {n} of {total}). About {left} more lines on it, then move on.`,
  agendaNext: `Time is up for "{previous}". {lineRef} wraps it up in a sentence and moves the meeting to the next agenda item: "{item}".`,

  /* ---------- whiteboard ---------- */
  boardInline: `Whiteboard: when a line adds a decision, an action item or an open question, include a "board" field in your JSON with only the NEW items: {"decisions":["..."],"actions":[{"task":"...","owner":"<name>"}],"questions":["..."],"answered":["<open question that is now resolved>"]}. Keep each item under 12 words. Leave the field out when nothing is new.
Current whiteboard:
{boardState}`,
  boardSummarySystem: `You keep the whiteboard for a team meeting. From the transcript, list the decisions made, the action items with their owners, and the questions still open. Keep each item under 12 words and at most 8 items per list. Reply with only a JSON object and nothing else: {"decisions":["..."],"actions":[{"task":"...","owner":"<name>"}],"questions":["..."]}`,
  boardSummaryUser: `Meeting topic: "{topic}"

{transcript}

Current whiteboard:
{boardState}

Update the whole whiteboard. JSON only.`,

  /* ---------- one agent per person ---------- */
  agentSystem: `You are {name}, {role}, in a live meeting with your colleagues around a table in a cozy office.
Your personality: {traits}

Your colleagues:
{others}

Meeting topic: "{topic}"

{agenda}

{flow}

{style}

{board}

{format}
`,
  agentColleague: `- {name}, {role}. {traits}`,
  agentFlow: `Speak only for yourself, in your own voice. React to what was just said, bring your own expertise, and move the discussion forward.`,
  agentMediatorFlow: `You are the mediator. Frame each point, react briefly, and invite ONE colleague by name to speak next. Make sure everyone is heard and the meeting reaches decisions.`,
  agentStyle: `How you talk:
- 1 to 3 short spoken sentences, under 55 words. It is read aloud: no markdown, lists, emojis, stage directions or name prefixes.
- Use colleagues' names now and then. Be concrete, disagree respectfully, and don't repeat points already made.
- The human stakeholder appears as "You" in the transcript. When they have just spoken, respond to them directly.`,
  agentFormat: `Reply with only a JSON object and nothing else: {"text":"<what you say out loud>","note":"<a short private note to remember for later, or empty>"}`,
  agentMediatorFormat: `Reply with only a JSON object and nothing else: {"text":"<what you say out loud>","next":"<name of the colleague you invite to speak next>","note":"<a short private note, or empty>"}`,
  agentBidFormat: `Reply with only a JSON object and nothing else: {"urge":<0 to 10, how strongly you want to speak right now>,"text":"<what you would say if chosen>","note":"<a short private note, or empty>"}`,
  agentNotes: `Your private notes from earlier in the meeting:
{notes}`,
  agentAsk: `It's your turn to speak. What do you say? JSON only.`,
  agentBidAsk: `Someone is about to speak next. How much do you want it to be you, and what would you say? Rate low if you have nothing new to add. JSON only.`,
  agentOpening: `You're opening the meeting: a quick hello, the topic, and what the team needs to decide today.`,
  agentReplyToYou: `The stakeholder (shown as "You") just spoke. Respond to them directly.`,
  agentInvited: `{host} just invited you to speak.`,
  agentClosing: `This is the final line of the meeting. Wrap up: the decisions made, who owns which next step, then thank everyone. Up to 4 sentences.`,
  directorSystem: `You direct a live team meeting and decide who speaks next, following natural meeting flow: whoever was just addressed or asked a question, whoever's expertise matters most for the point on the table, or whoever would genuinely react. Don't pick the person who spoke last unless they were asked something directly. Over the meeting everyone should contribute.

The team:
{team}

Meeting topic: "{topic}"

{agenda}

Reply with only a JSON object and nothing else: {"next":"<the person's name>"}`,
  directorAsk: `Who should speak next? JSON only.`,

  /* ---------- tools (MCP) ---------- */
  toolsWriter: `Tools: some people can use tools during the meeting (each tool says who). Use one only when it genuinely helps the line you're writing, set "_speaker" to the person using it, then have that person mention what they found in plain speech. After any tool use, still reply in the required JSON format.`,
  toolsAgent: `Tools: you can use the tools you've been given during the meeting. Use one only when it genuinely helps what you're about to say, then mention what you found in plain speech, as a person would. After any tool use, still reply in the required JSON format.`,

  /* ---------- mock interview ---------- */
  interviewSystem: `You voice a panel interviewing a candidate for this role: {role}.

The panel:
{team}

{jd}

How the panel talks:
- 1 to 3 short spoken sentences, under 60 words. Warm but professional. It is read aloud: no markdown, lists or stage directions.
- The candidate appears as "You" in the transcript.
- Ask one thing at a time. Never answer for the candidate.

Reply with only a JSON object and nothing else: {"speaker":"<the panelist's name>","text":"<spoken words>"}`,
  interviewJd: `Job description:
{jdText}`,
  interviewIntro: `{asker} opens the interview: welcome the candidate, introduce the panel by name in one sentence, and explain the format. Don't ask a question yet.`,
  interviewAsk: `{asker} asks the next question. You may acknowledge the previous answer in a few words first. Keep the meaning of this question, phrased naturally: "{question}"`,
  interviewFollowup: `The candidate just answered. {asker} asks one short follow-up that probes a gap, a vague claim or a trade-off in that answer.`,
  interviewClosing: `{asker} closes the interview: thank the candidate and explain the next steps. No more questions.`,
  interviewPlanSystem: `You prepare interview questions. Write {count} distinct questions for the role below, based on the job description: a realistic mix of technical depth, system design, past experience and behaviour, in the order an interview would ask them. Reply with only a JSON object and nothing else: {"questions":["..."]}`,
  interviewPlanUser: `Role: {role}

Job description:
{jdText}

JSON only.`,
  interviewScoreSystem: `You are an experienced hiring panel giving honest, specific feedback on a mock interview for this role: {role}. Score each answer from 1 to 10 against what a strong candidate would say. Be direct and practical. For each answer, outline a stronger answer in two or three sentences.

Reply with only a JSON object and nothing else: {"overall":<1-10>,"verdict":"<Strong hire | Hire | Lean hire | Lean no | No hire>","summary":"<2-3 sentences>","strengths":["..."],"improvements":["..."],"answers":[{"question":"...","score":<1-10>,"feedback":"...","stronger":"..."}]}`,
  interviewScoreUser: `{jd}

Interview transcript:
{transcript}

Score the candidate ("You"). JSON only.`,
}

/** The system prompt shipped by the previous version, so it can be upgraded if it was never edited. */
export const LEGACY_PROMPTS = {
  system: ["You write a live, realistic meeting between {teamSize} colleagues sitting around a table in a cozy office. Each line is spoken by exactly ONE person.\n\nThe team:\n{team}\n\nMeeting topic: \"{topic}\"\n\n{flow}\n\n{style}\n\n{format}"],
}

const COMMON = ['topic', 'teamSize', 'host', 'hostRole']
const G = {
  sys: 'One writer: system prompt',
  req: 'One writer: each request',
  moments: 'Meeting moments (fill {phases})',
  agenda: 'Agenda',
  board: 'Whiteboard',
  agents: 'One agent per person',
  director: 'Director',
  interview: 'Mock interview',
}

/** Shown in Settings so each box lists the placeholders it can use. */
export const PROMPT_PARTS = [
  { group: G.sys, key: 'system', label: 'Main system prompt', vars: [...COMMON, 'team', 'agenda', 'flow', 'style', 'board', 'format'] },
  { group: G.sys, key: 'teamMember', label: 'One team member (fills {team})', vars: ['name', 'role', 'traits', 'gender'] },
  { group: G.sys, key: 'flowFreeflow', label: 'Free flow rules (fills {flow})', vars: COMMON },
  { group: G.sys, key: 'flowMediator', label: 'Mediator rules (fills {flow})', vars: COMMON },
  { group: G.sys, key: 'style', label: 'How people talk (fills {style})', vars: COMMON },
  { group: G.sys, key: 'formatSingle', label: 'Reply format, one line per call (fills {format})', vars: [...COMMON, 'lineCount'], warn: true },
  { group: G.sys, key: 'formatBatch', label: 'Reply format, several lines per call (fills {format})', vars: [...COMMON, 'lineCount'], warn: true },
  { group: G.req, key: 'user', label: 'Request message', vars: [...COMMON, 'transcript', 'phases', 'ask', 'lineCount'] },
  { group: G.req, key: 'transcriptLine', label: 'One transcript line', vars: ['name', 'role', 'text'] },
  { group: G.req, key: 'transcriptIntro', label: 'Before the transcript', vars: [] },
  { group: G.req, key: 'transcriptEmpty', label: 'When nobody has spoken yet', vars: [] },
  { group: G.req, key: 'askSingle', label: 'The ask, one line per call (fills {ask})', vars: COMMON },
  { group: G.req, key: 'askBatch', label: 'The ask, several lines per call (fills {ask})', vars: [...COMMON, 'lineCount'] },
  { group: G.moments, key: 'opening', label: 'Opening the meeting', vars: [...COMMON, 'lineRef'] },
  { group: G.moments, key: 'replyToYou', label: 'After you jump in', vars: [...COMMON, 'lineRef'] },
  { group: G.moments, key: 'mediatorNudge', label: 'Mediator steps back in (mediator mode)', vars: [...COMMON, 'lineRef'] },
  { group: G.moments, key: 'converge', label: 'Nearly out of time', vars: COMMON },
  { group: G.moments, key: 'closing', label: 'Closing the meeting', vars: [...COMMON, 'lineRef'] },
  { group: G.moments, key: 'keepGoing', label: 'Middle of the meeting', vars: COMMON },
  { group: G.agenda, key: 'agendaBlock', label: 'Agenda in the system prompt (fills {agenda})', vars: [...COMMON, 'agendaList'] },
  { group: G.agenda, key: 'agendaItem', label: 'One agenda item (fills {agendaList})', vars: ['n', 'item'] },
  { group: G.agenda, key: 'agendaCurrent', label: 'Current item (a meeting moment)', vars: [...COMMON, 'item', 'n', 'total', 'left'] },
  { group: G.agenda, key: 'agendaNext', label: 'Moving to the next item (a meeting moment)', vars: [...COMMON, 'item', 'previous', 'n', 'total', 'lineRef'] },
  { group: G.board, key: 'boardInline', label: 'Inline updates (fills {board})', vars: [...COMMON, 'boardState'], warn: true },
  { group: G.board, key: 'boardSummarySystem', label: 'Summary call: system prompt', vars: COMMON, warn: true },
  { group: G.board, key: 'boardSummaryUser', label: 'Summary call: request', vars: [...COMMON, 'transcript', 'boardState'] },
  { group: G.agents, key: 'agentSystem', label: "Each agent's system prompt", vars: ['name', 'role', 'traits', 'others', ...COMMON, 'agenda', 'flow', 'style', 'board', 'format'] },
  { group: G.agents, key: 'agentColleague', label: 'One colleague (fills {others})', vars: ['name', 'role', 'traits', 'gender'] },
  { group: G.agents, key: 'agentFlow', label: 'Speaking for yourself (fills {flow})', vars: ['name', 'role', ...COMMON] },
  { group: G.agents, key: 'agentMediatorFlow', label: 'The mediator agent (fills {flow})', vars: ['name', 'role', ...COMMON] },
  { group: G.agents, key: 'agentStyle', label: 'How agents talk (fills {style})', vars: ['name', 'role', ...COMMON] },
  { group: G.agents, key: 'agentFormat', label: 'Reply format (fills {format})', vars: ['name', ...COMMON], warn: true },
  { group: G.agents, key: 'agentMediatorFormat', label: 'Mediator reply format (fills {format})', vars: ['name', ...COMMON], warn: true },
  { group: G.agents, key: 'agentBidFormat', label: 'Bid reply format (fills {format})', vars: ['name', ...COMMON], warn: true },
  { group: G.agents, key: 'agentNotes', label: 'Private notes (added to the request)', vars: ['name', 'notes'] },
  { group: G.agents, key: 'agentAsk', label: 'The ask (fills {ask})', vars: ['name', ...COMMON] },
  { group: G.agents, key: 'agentBidAsk', label: 'The ask when bidding (fills {ask})', vars: ['name', ...COMMON] },
  { group: G.agents, key: 'agentOpening', label: 'Opening the meeting', vars: ['name', ...COMMON] },
  { group: G.agents, key: 'agentReplyToYou', label: 'After you jump in', vars: ['name', ...COMMON] },
  { group: G.agents, key: 'agentInvited', label: 'Invited by the mediator', vars: ['name', ...COMMON] },
  { group: G.agents, key: 'agentClosing', label: 'Closing the meeting', vars: ['name', ...COMMON] },
  { group: G.director, key: 'directorSystem', label: 'Director system prompt', vars: [...COMMON, 'team', 'agenda'], warn: true },
  { group: G.director, key: 'directorAsk', label: 'Director ask (fills {ask})', vars: COMMON },
  { group: 'Tools (MCP)', key: 'toolsWriter', label: 'Added to the one-writer system prompt when anyone has tools', vars: [] },
  { group: 'Tools (MCP)', key: 'toolsAgent', label: "Added to a person's system prompt when they have tools", vars: ['name', 'role'] },
  { group: G.interview, key: 'interviewSystem', label: 'Panel system prompt', vars: ['role', 'team', 'jd', 'host'], warn: true },
  { group: G.interview, key: 'interviewJd', label: 'Job description block (fills {jd})', vars: ['jdText', 'role'] },
  { group: G.interview, key: 'interviewIntro', label: 'Opening the interview', vars: ['asker', 'role'] },
  { group: G.interview, key: 'interviewAsk', label: 'Asking a question', vars: ['asker', 'question', 'n', 'total', 'role'] },
  { group: G.interview, key: 'interviewFollowup', label: 'Follow-up question', vars: ['asker', 'role'] },
  { group: G.interview, key: 'interviewClosing', label: 'Closing the interview', vars: ['asker', 'role'] },
  { group: G.interview, key: 'interviewPlanSystem', label: 'Questions from the job description: system', vars: ['role', 'count'], warn: true },
  { group: G.interview, key: 'interviewPlanUser', label: 'Questions from the job description: request', vars: ['role', 'jdText', 'count'] },
  { group: G.interview, key: 'interviewScoreSystem', label: 'Scorecard: system', vars: ['role'], warn: true },
  { group: G.interview, key: 'interviewScoreUser', label: 'Scorecard: request', vars: ['role', 'jd', 'transcript'] },
]

export function fill(template, vars) {
  return String(template ?? '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const merged = (prompts) => ({ ...DEFAULT_PROMPTS, ...prompts })

export function transcriptText(P, transcript, limit = 26) {
  const lines = transcript.slice(-limit).map((l) => fill(P.transcriptLine, { name: l.name, role: l.role, text: l.text }))
  return lines.length ? `${P.transcriptIntro}\n${lines.join('\n')}` : P.transcriptEmpty
}

function agendaBlock(P, base, agendaList) {
  if (!agendaList?.length) return ''
  const list = agendaList.map((item, i) => fill(P.agendaItem, { n: i + 1, item })).join('\n')
  return fill(P.agendaBlock, { ...base, agendaList: list })
}

const describe = (P, key, p, base) => fill(P[key], { ...base, name: p.name, role: p.role, traits: p.traits, gender: p.gender })

/**
 * One writer voices everyone.
 * phases: [{ key, ...vars }] naming which "meeting moment" templates apply.
 */
export function buildPrompt({ prompts, personas, topic, transcript, phases, mode, host, count, agendaList, boardState }) {
  const P = merged(prompts)
  const base = { topic, teamSize: personas.length, host: host.name, hostRole: host.role, lineCount: count }
  const team = personas.map((p) => describe(P, 'teamMember', p, base)).join('\n')
  const flow = fill(mode === 'mediator' ? P.flowMediator : P.flowFreeflow, base)
  const style = fill(P.style, base)
  const format = fill(count === 1 ? P.formatSingle : P.formatBatch, base)
  const agenda = agendaBlock(P, base, agendaList)
  const board = boardState != null ? fill(P.boardInline, { ...base, boardState }) : ''
  const system = fill(P.system, { ...base, team, flow, style, format, agenda, board })
  const phaseText = phases.map((ph) => fill(P[ph.key], { ...base, lineRef: '', ...ph })).join('\n')
  const ask = fill(count === 1 ? P.askSingle : P.askBatch, base)
  const prompt = fill(P.user, { ...base, transcript: transcriptText(P, transcript), phases: phaseText, ask })
  return { system, prompt }
}

/** One agent speaking (or bidding) for itself. kind: 'speak' | 'mediator' | 'bid' */
export function buildAgentPrompt({ prompts, persona, personas, topic, transcript, phases, host, kind, notes, agendaList, boardState }) {
  const P = merged(prompts)
  const base = { topic, teamSize: personas.length, host: host.name, hostRole: host.role, name: persona.name, role: persona.role }
  const others = personas.filter((p) => p.name !== persona.name).map((p) => describe(P, 'agentColleague', p, base)).join('\n')
  const flow = fill(kind === 'mediator' ? P.agentMediatorFlow : P.agentFlow, base)
  const style = fill(P.agentStyle, base)
  const format = fill(kind === 'mediator' ? P.agentMediatorFormat : kind === 'bid' ? P.agentBidFormat : P.agentFormat, base)
  const agenda = agendaBlock(P, base, agendaList)
  const board = boardState != null && kind !== 'bid' ? fill(P.boardInline, { ...base, boardState }) : ''
  const system = fill(P.agentSystem, { ...base, traits: persona.traits, others, flow, style, format, agenda, board })
  const phaseText = [
    notes?.length ? fill(P.agentNotes, { ...base, notes: notes.map((n) => `- ${n}`).join('\n') }) : '',
    ...phases.map((ph) => fill(P[ph.key], { ...base, lineRef: 'Your line', ...ph })),
  ]
    .filter(Boolean)
    .join('\n\n')
  const ask = fill(kind === 'bid' ? P.agentBidAsk : P.agentAsk, base)
  const prompt = fill(P.user, { ...base, transcript: transcriptText(P, transcript), phases: phaseText, ask })
  return { system, prompt }
}

export function buildDirectorPrompt({ prompts, personas, topic, transcript, phases, host, agendaList }) {
  const P = merged(prompts)
  const base = { topic, teamSize: personas.length, host: host.name, hostRole: host.role }
  const team = personas.map((p) => describe(P, 'teamMember', p, base)).join('\n')
  const system = fill(P.directorSystem, { ...base, team, agenda: agendaBlock(P, base, agendaList) })
  const phaseText = phases.map((ph) => fill(P[ph.key], { ...base, lineRef: 'The next line', ...ph })).join('\n')
  const prompt = fill(P.user, { ...base, transcript: transcriptText(P, transcript), phases: phaseText, ask: fill(P.directorAsk, base) })
  return { system, prompt }
}

export function buildBoardSummaryPrompt({ prompts, topic, transcript, boardState, host, personas }) {
  const P = merged(prompts)
  const base = { topic, teamSize: personas.length, host: host.name, hostRole: host.role }
  return {
    system: fill(P.boardSummarySystem, base),
    prompt: fill(P.boardSummaryUser, { ...base, transcript: transcriptText(P, transcript, 60), boardState }),
  }
}

/* ---------- interview ---------- */

const jdBlock = (P, role, jdText) => (jdText?.trim() ? fill(P.interviewJd, { role, jdText: jdText.trim() }) : '')

export function buildInterviewPrompt({ prompts, panel, role, jdText, transcript, phase, host }) {
  const P = merged(prompts)
  const team = panel.map((p) => describe(P, 'teamMember', p, {})).join('\n')
  const system = fill(P.interviewSystem, { role, team, jd: jdBlock(P, role, jdText), host: host.name })
  const prompt = fill(P.user, {
    transcript: transcriptText(P, transcript, 30),
    phases: fill(P[phase.key], { role, ...phase }),
    ask: fill(P.askSingle, {}),
  })
  return { system, prompt }
}

export function buildPlanPrompt({ prompts, role, jdText, count }) {
  const P = merged(prompts)
  return { system: fill(P.interviewPlanSystem, { role, count }), prompt: fill(P.interviewPlanUser, { role, jdText, count }) }
}

export function buildScorePrompt({ prompts, role, jdText, transcript }) {
  const P = merged(prompts)
  return {
    system: fill(P.interviewScoreSystem, { role }),
    prompt: fill(P.interviewScoreUser, { role, jd: jdBlock(P, role, jdText), transcript: transcriptText(P, transcript, 200) }),
  }
}
