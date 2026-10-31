// Every piece of text sent to the model. All of it is editable in Settings → Prompts.
// Placeholders look like {name}. Unknown placeholders are left as they are.

export const DEFAULT_PROMPTS = {
  system: `You write a live, realistic meeting between {teamSize} colleagues sitting around a table in a cozy office. Each line is spoken by exactly ONE person.

The team:
{team}

Meeting topic: "{topic}"

{flow}

{style}

{format}`,

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
}

const COMMON = ['topic', 'teamSize', 'host', 'hostRole']

/** Shown in Settings so each box lists the placeholders it can use. */
export const PROMPT_PARTS = [
  { group: 'System prompt', key: 'system', label: 'Main system prompt', vars: [...COMMON, 'team', 'flow', 'style', 'format'] },
  { group: 'System prompt', key: 'teamMember', label: 'One team member (repeated for each person, fills {team})', vars: ['name', 'role', 'traits', 'gender'] },
  { group: 'System prompt', key: 'flowFreeflow', label: 'Free flow rules (fills {flow})', vars: COMMON },
  { group: 'System prompt', key: 'flowMediator', label: 'Mediator rules (fills {flow})', vars: COMMON },
  { group: 'System prompt', key: 'style', label: 'How people talk (fills {style})', vars: COMMON },
  { group: 'System prompt', key: 'formatSingle', label: 'Reply format, one line per call (fills {format})', vars: [...COMMON, 'lineCount'], warn: true },
  { group: 'System prompt', key: 'formatBatch', label: 'Reply format, several lines per call (fills {format})', vars: [...COMMON, 'lineCount'], warn: true },
  { group: 'Each request', key: 'user', label: 'Request message', vars: [...COMMON, 'transcript', 'phases', 'ask', 'lineCount'] },
  { group: 'Each request', key: 'transcriptLine', label: 'One transcript line', vars: ['name', 'role', 'text'] },
  { group: 'Each request', key: 'transcriptIntro', label: 'Before the transcript', vars: [] },
  { group: 'Each request', key: 'transcriptEmpty', label: 'When nobody has spoken yet', vars: [] },
  { group: 'Each request', key: 'askSingle', label: 'The ask, one line per call (fills {ask})', vars: COMMON },
  { group: 'Each request', key: 'askBatch', label: 'The ask, several lines per call (fills {ask})', vars: [...COMMON, 'lineCount'] },
  { group: 'Meeting moments (fill {phases})', key: 'opening', label: 'Opening the meeting', vars: [...COMMON, 'lineRef'] },
  { group: 'Meeting moments (fill {phases})', key: 'replyToYou', label: 'After you jump in', vars: [...COMMON, 'lineRef'] },
  { group: 'Meeting moments (fill {phases})', key: 'mediatorNudge', label: 'Mediator steps back in (mediator mode)', vars: [...COMMON, 'lineRef'] },
  { group: 'Meeting moments (fill {phases})', key: 'converge', label: 'Nearly out of time', vars: COMMON },
  { group: 'Meeting moments (fill {phases})', key: 'closing', label: 'Closing the meeting', vars: [...COMMON, 'lineRef'] },
  { group: 'Meeting moments (fill {phases})', key: 'keepGoing', label: 'Middle of the meeting', vars: COMMON },
]

export function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/**
 * Assemble the system prompt and request message.
 * phases: list of { key, lineRef? } naming which "meeting moment" templates apply.
 */
export function buildPrompt({ prompts, personas, topic, transcript, phases, mode, host, count }) {
  const P = { ...DEFAULT_PROMPTS, ...prompts }
  const base = { topic, teamSize: personas.length, host: host.name, hostRole: host.role, lineCount: count }
  const team = personas.map((p) => fill(P.teamMember, { ...base, name: p.name, role: p.role, traits: p.traits, gender: p.gender })).join('\n')
  const flow = fill(mode === 'mediator' ? P.flowMediator : P.flowFreeflow, base)
  const style = fill(P.style, base)
  const format = fill(count === 1 ? P.formatSingle : P.formatBatch, base)
  const system = fill(P.system, { ...base, team, flow, style, format })

  const lines = transcript.slice(-26).map((l) => fill(P.transcriptLine, { name: l.name, role: l.role, text: l.text }))
  const transcriptText = lines.length ? `${P.transcriptIntro}\n${lines.join('\n')}` : P.transcriptEmpty
  const phaseText = phases.map((ph) => fill(P[ph.key], { ...base, lineRef: ph.lineRef ?? '' })).join('\n')
  const ask = fill(count === 1 ? P.askSingle : P.askBatch, base)
  const prompt = fill(P.user, { ...base, transcript: transcriptText, phases: phaseText, ask })
  return { system, prompt }
}
