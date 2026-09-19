// The agent host: the app runs Claude Code / Codex as child processes for chat sessions, keeps the conversation
// open, turns their streaming JSON into ChatEvents, persists them to the session and pushes them to subscribers.
// Lives on globalThis so dev-server module reloads do not orphan the processes.
import { spawn, type ChildProcess } from 'node:child_process';
import { getSession, updateSession, appendTranscript, enqueue, takeFromQueue, markTurnEnd, queueMessage, imageLines, filesDir } from './sessions';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { queueView, type ChatEvent, type QueueItem, type QueueView, type Session, type TurnUsage } from './session-types';
import { loadScope } from './scope';
import { resolveLink, renderResolved } from './resolve';
import { REPO_ROOT } from './products';
import { agentSystemPrompt } from './agent-prompt';
import { createPlanDoc, closePlanDoc } from './plan-docs';
import { firstUserEvent } from './transcript';
import { packetFor } from './packet';
import './consolidate';   // registers the session-end consolidation hook (decision:memory.consolidate-sessions)

// `turn`: the queue items handed to the open turn — stamped done / failed when it ends (decision:wf2.queue-item-state);
// `product` / `wfUrl` let the pump build a first message when a fresh item comes up (rule:clean-slate); `stopped`: the
// person ended the process, so its exit must not rewrite the recorded status.
type Live = { id: string; productDir: string; product: string; wfUrl: string; agent: string; cwd: string; proc: ChildProcess | null; subs: Set<(e: ChatEvent) => void>; pending: ChatEvent[]; flush: ReturnType<typeof setTimeout> | null; agentSessionId?: string; turnBusy: boolean; pumping: boolean; codexThread?: string; known: Set<string>; model?: string; codexUsage?: TurnUsage; idle?: ReturnType<typeof setTimeout>; turn: string[]; stopped?: boolean };
const g = globalThis as unknown as { __wfAgentHost?: Map<string, Live> };
const live = () => (g.__wfAgentHost ??= new Map<string, Live>());

// a stopped process counts as gone at once, before its exit lands — the row leaves Active on the next paint
export function isLive(id: string): boolean { const l = live().get(id); return !!l && !l.stopped && (!!l.proc || l.agent === 'codex'); }
// What the process behind a session is doing: live (alive, whatever its recorded status) and busy (a turn is open)
export function liveState(id: string): { live: boolean; busy: boolean } { const l = live().get(id); return { live: isLive(id), busy: !!l && (l.turnBusy || !!(l.agent === 'codex' && l.proc)) }; }
export function liveIds(): string[] { return [...live().keys()]; }

function emit(l: Live, e: Omit<ChatEvent, 't'> & { t?: string }) {
  const ev = { t: new Date().toISOString(), ...e } as ChatEvent;
  for (const fn of l.subs) { try { fn(ev); } catch { /* subscriber gone */ } }
  l.pending.push(ev);
  if (!l.flush) l.flush = setTimeout(() => { const batch = l.pending; l.pending = []; l.flush = null; appendTranscript(l.productDir, l.id, batch).catch(() => {}); }, 400);
}

export type QueueListener = (q: QueueView) => void;
const queueSubs = (globalThis as unknown as { __wfQueueSubs?: Map<string, Set<QueueListener>> }).__wfQueueSubs ??= new Map();
export function subscribeQueue(id: string, fn: QueueListener): () => void { if (!queueSubs.has(id)) queueSubs.set(id, new Set()); queueSubs.get(id)!.add(fn); return () => { queueSubs.get(id)?.delete(fn); }; }
export async function notifyQueue(productDir: string, id: string) { const s = await getSession(productDir, id); if (!s) return; const q = queueView(s.queue, s.batch); for (const fn of queueSubs.get(id) ?? []) { try { fn(q); } catch { /* gone */ } } }

export function subscribe(id: string, fn: (e: ChatEvent) => void): () => void {
  const l = live().get(id); if (!l) return () => {};
  l.subs.add(fn); return () => { l.subs.delete(fn); };
}

// The plan document of the request (rule:plan-doc, decision:wf2.plan-per-request): every request that starts work has
// one — the page the person and the agent work on, where the tasks live and where the app writes the result.
export function planDocNote(planDoc?: string): string {
  if (!planDoc) return '\n## The plan document\nNo plan document could be created for this request; write the plan and its tasks on the subject\'s page instead.';
  const [product, project, slug] = planDoc.split('/');
  return `\n## The plan document\nThis request's plan document is \`${planDoc}\` (node \`plan:${slug}\`, file data/products/${product}/projects/${project}/docs/${slug}.md, under the project's Plans page). The app created it with the request under "Request" and empty Context / Plan / Tasks / Result sections. Keep the work there: what you found under **Context** (tags \`kind:slug\`, embeds \`![[kind:slug]]\`), what you decided or cannot answer under **Plan** (\`decision:\` and \`question:\` blocks), the work as \`- [ ] task:<product>.<slug> … part of plan:${slug}\` lines under **Tasks** — tick them with \`wf node set task:… --status done\` as you go, that is what the person watches. The app writes **Result** (your \`wf session done\` summary and the blocks this plan produced) when the session ends.`;
}

// Plan-first protocol (rule:plan-first): a request with "plan first" on is understood and proposed on its plan
// document before anything is built; the person confirms through the agent's question card (rule:agent-questions).
export function planFirst(planDoc?: string): string {
  const slug = planDoc?.split('/')[2] ?? '';
  return `
## Before you build — plan first, on the plan document
This request came with "plan first" on. The plan is a page the person and you work on together — the plan document above — not a chat message. Do not change code until the person has confirmed it:
1. Understand: run \`wf context "<the request in your words>"\`, resolve the nodes it returns (\`wf resolve\`) and read the documents they live in; look at the code areas involved. Work out which part of the app and which knowledge — modules, documents, requirements, rules, decisions, tasks — the change touches.
2. Model: name the subject of the request as one node, \`kind:slug\` — the node under the cursor or the document from Context when they fit, else the node you found, else the new node the request creates ("add a page X" → \`page:x\`). Make sure its type exists: \`wf node type:<kind>\` (base types such as page, entity, op, action, component, req, rule, decision, task exist already); if not, \`wf type add <kind> --extends <parent> --purpose "…"\` writes a proposed type card into the product's ontology document. The subject's page is the document where the node is defined, else the document the request came from (Context above), else the type's home; only when the subject is new and no document fits, create one — \`wf doc create <product/project/slug> --title "…" [--parent <doc>]\`.
3. Write the plan on the plan document (\`wf doc\` to read, edit the file, \`ctx --root data/products/<product> check\` green). Under **Context**: the modules, documents, nodes and code paths the request touches, as tags (\`kind:slug\` in prose) and embeds (\`![[kind:slug]]\` on a line of its own shows that block's card). Under **Plan**: prose for what you understood; \`question:\` blocks (status: open) for what you cannot answer; \`decision:\` blocks (status: proposed) for what is decided. Requirements, rules, components, pages and the subject's card are defined on the subject's page (one source, with the entity) and embedded on the plan document with \`![[id]]\`. Under **Tasks**: \`- [ ] task:<product>.<slug> … part of plan:${slug || '<slug>'}\` lines for the work, in order. Prose explains; blocks carry what is required, decided, asked and to do.
4. Show it: \`wf session open <session id> ${planDoc || '<product/project/doc>'}\` — the person's browser navigates to the plan document while this conversation stays in the context column. Say in one chat line what is on the page.
5. Collaborate: the person adds, comments, changes and answers on the page. Ask with one AskUserQuestion — header "Plan", the question "Build what the page says?", options "Proceed", "Adjust" (they say what to change, here or on the page), "Cancel". Wait for the answer; on Adjust re-read the page (\`wf doc\`), revise it and ask again; on Cancel stop after \`wf session done\`.
6. Build: only after Proceed — re-read the plan document once more (the person may have changed it), then code and tests for what it says, then statuses (\`wf node set task:… --status done\`, reqs shipped) and \`wf session done <session id> "<summary>"\` — the summary and the blocks you changed land under "Result" on the plan document.`;
}

// `wf session open`: navigate the person to a page. Only a chat session with a live console can move the browser;
// the session log keeps the line either way.
export function openInSession(id: string, path: string): boolean {
  const l = live().get(id); if (!l) return false;
  emit(l, { kind: 'open', text: path });
  return true;
}

// The constraints in force for a request (decision:memory.constraint-packet, req:memory.intake-packet): computed by
// the app from the refs and the instruction, put in front of the agent — validation that does not depend on the agent
// remembering to look. Never blocks the start: a failure becomes one line saying so.
export async function constraintsSection(scope: Awaited<ReturnType<typeof loadScope>>, s: Session): Promise<string> {
  if (!scope) return '';
  if (!scope.graph.nodes.length) return '\n## Constraints in force\n_The product has no graph yet — nothing governs this request; write what you learn as blocks._';
  try {
    const { markdown } = await packetFor(scope, s.instruction, [...(s.source?.link ? [s.source.link] : []), ...s.refs], { budget: 10000 });
    return `\n## Constraints in force\n${markdown}\n\nThe same for any text, mid-session: \`wf packet --for "<text>" [--ref id]\`.`;
  } catch (e) { return `\n## Constraints in force\n_Could not compute the constraint packet (${e instanceof Error ? e.message : e}); run \`wf packet --for "<the request>"\` yourself before you change anything._`; }
}

// The first message: the instruction plus every ref and the source link resolved to text, the constraints in force,
// and how to talk back. With `productDir` the request's images (store:session-files) are listed by absolute path
// under the instruction.
export async function buildPrompt(product: string, s: Session, wfUrl: string, productDir?: string): Promise<string> {
  const scope = await loadScope(product);
  const paths = productDir && s.images?.length ? s.images.map(n => path.join(filesDir(productDir, s.id), n)) : [];
  const parts = [`You are working on the product "${product}" in Wye (requirements, rules, decisions, goals and tasks kept as markdown; the app at ${wfUrl} shows this conversation live). Session ${s.id}.`, `\n## Instruction\n${s.instruction}${imageLines(paths)}`];
  const ctx: string[] = []; const seen = new Set<string>();
  for (const ref of [...(s.source?.link ? [s.source.link] : []), ...s.refs]) {
    if (seen.has(ref) || !scope) continue; seen.add(ref);
    try { const j = await resolveLink(scope, ref); ctx.push(j ? renderResolved(ref, j) : `- ${ref}: not found`); } catch (e) { ctx.push(`- ${ref}: could not resolve (${e instanceof Error ? e.message : e})`); }
  }
  if (ctx.length) parts.push(`\n## Context\n${ctx.join('\n\n')}`);
  parts.push(await constraintsSection(scope, s));
  if (s.parent) parts.push(`\nThis session continues session ${s.parent}; its log and result are in the instruction above.`);
  parts.push(planDocNote(s.planDoc));
  if (s.plan) parts.push(planFirst(s.planDoc));
  parts.push(`\n## How to work\n- The Wye CLI is \`wf\` (WF_URL=${wfUrl}, WF_PRODUCT=${product}). Read: \`wf resolve <link|id>\`, \`wf doc <product/project/doc>\`, \`wf node <id>\`, \`wf context "<text>"\`. Write: \`wf node set <id> --status s --set key=value\`, \`wf doc write <product/project/doc> --file f\`.\n- Product documents live under ${REPO_ROOT}/data/products/${product}/projects/<project>/docs/ (markdown; a line that starts with an id defines that node; keep ids stable). Run \`ctx --root data/products/${product} check\` from ${REPO_ROOT} after editing them.\n- This is a conversation: the person can reply here. Ask when something is unclear; say plainly what you changed.`);
  return parts.join('\n');
}

// Start (or resume) the agent process for a chat session and send the first message.
// `firstMessage` with `images` (file names under the session) replaces the prompt built from the session's own
// instruction — a fresh restart (restartFresh) sends the new request that way; `shown` is the part of it the console
// shows as the person's words (req:wf2.console.first-message-is-the-request), the instruction when absent. The Live entry is reused when one
// exists so the console's subscribers keep receiving events across a restart.
export async function startChat(productDir: string, product: string, id: string, opts: { wfUrl: string; firstMessage?: string; shown?: string; images?: string[]; resume?: boolean }): Promise<Session | null> {
  const s = await getSession(productDir, id); if (!s) return null;
  if (live().get(id)?.proc) return s;
  const cwd = s.cwd || REPO_ROOT;
  const l: Live = live().get(id) ?? { id, productDir, product, wfUrl: opts.wfUrl, agent: s.agent, cwd, proc: null, subs: new Set(), pending: [], flush: null, turnBusy: false, pumping: false, known: new Set(), turn: [] };
  Object.assign(l, { product, wfUrl: opts.wfUrl, agent: s.agent, cwd, proc: null, stopped: false, agentSessionId: s.agentSessionId, turnBusy: false, pumping: false, codexThread: s.agent === 'codex' ? s.agentSessionId : undefined, model: undefined, known: new Set([...(s.artifacts?.docs ?? []), ...(s.artifacts?.nodes ?? []), ...(s.artifacts?.blocks ?? []).flatMap(b => [b.id, `${b.id}@${b.at}`])]) });
  live().set(id, l);
  return startProcess(l, s, product, opts);
}
async function startProcess(l: Live, s: Session, product: string, opts: { wfUrl: string; firstMessage?: string; shown?: string; images?: string[]; resume?: boolean }): Promise<Session | null> {
  const { id, productDir, cwd } = l;
  const first = opts.firstMessage ?? (opts.resume ? undefined : await buildPrompt(product, s, opts.wfUrl, productDir));
  // the console's user row: the request as the person wrote it; the wrapper the agent received rides on `prompt`
  const userEvent = (images: string[]) => first ? firstUserEvent(first, opts.shown ?? s.instruction, images) : null;
  // the request's images go with the first message the way pump sends a queued message's ones
  const imgs = first && !opts.resume ? await loadImages(productDir, id, opts.images ?? s.images ?? []) : [];
  const shown = imgs.map(i => `/api/${product}/sessions/${id}/file/${i.name}`);
  const system = await agentSystemPrompt(product, productDir, opts.wfUrl);
  await updateSession(productDir, id, { status: 'running', runner: `app@${process.pid}`, line: opts.resume ? 'resumed' : 'started in the app', cwd });
  if (s.agent === 'codex') {
    // codex exec has no system-prompt flag: the contract opens the first turn
    emit(l, { kind: 'note', text: `codex in ${cwd}` });
    if (first) { emit(l, userEvent(shown)!); codexTurn(l, cwd, l.codexThread ? first : `${system}\n\n---\n\n${first}`, true, imgs.map(i => i.path)); } else pump(l);
    return getSession(productDir, id);
  }
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio', '--forward-subagent-text', '--append-system-prompt', system, '--add-dir', REPO_ROOT];
  if (opts.resume && s.agentSessionId) args.push('--resume', s.agentSessionId);
  const proc = spawn('claude', args, { cwd, env: { ...process.env, WF_URL: opts.wfUrl, WF_PRODUCT: product, WF_SESSION: id } });
  l.proc = proc;
  emit(l, { kind: 'note', text: `claude ${opts.resume ? 'resumed' : 'started'} in ${cwd} · Wye contract applied as system prompt` });
  let buf = '';
  // a process replaced by restartFresh may still write its last lines: they are not this conversation's any more
  proc.stdout.on('data', d => { if (l.proc !== proc) return; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onClaudeLine(l, line); } });
  proc.stderr.on('data', d => { if (l.proc !== proc) return; const t = String(d).trim(); if (t) emit(l, { kind: 'stderr', text: t.slice(0, 2000) }); });
  proc.on('close', code => { if (l.proc !== proc) return; clearIdle(l); reportKnowledge(l, 0); emit(l, { kind: 'exit', code: code ?? -1, text: `claude exited (${code})` }); l.proc = null; endTurn(l, l.turnBusy ? { error: `agent exited with ${code} during the turn` } : undefined); l.turnBusy = false; if (l.stopped) return; getSession(productDir, id).then(cur => { if (cur?.status === 'cancelled') return; return updateSession(productDir, id, { status: code === 0 ? 'done' : 'failed', line: `agent exited with ${code}` }); }).catch(() => {}); });
  proc.stdin.on('error', () => {});
  if (first) { emit(l, userEvent(shown)!); writeUser(l, first, imgs); } else setTimeout(() => pump(l), 500); // a resumed agent takes what waited in the queue
  return getSession(productDir, id);
}

function writeUser(l: Live, text: string, images: { mediaType: string; data: string }[] = []) {
  if (!l.proc) return;
  l.turnBusy = true; clearIdle(l);
  const content: unknown[] = [{ type: 'text', text }, ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))];
  l.proc.stdin!.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
}
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
async function loadImages(productDir: string, id: string, names: string[]): Promise<{ name: string; path: string; mediaType: string; data: string }[]> {
  const out = [];
  for (const n of names) { try { const p = path.join(filesDir(productDir, id), n); out.push({ name: n, path: p, mediaType: MIME[n.split('.').pop()!] ?? 'image/png', data: (await readFile(p)).toString('base64') }); } catch { /* gone */ } }
  return out;
}

// The tokens of a claude turn from its result event: usage counts the turn (every API call of it, `iterations`);
// the context is the last call's prompt; the window comes from modelUsage for the session's model.
function claudeUsage(j: Record<string, unknown>, model?: string): TurnUsage | undefined {
  const u = j.usage as Record<string, unknown> | undefined; if (!u) return undefined;
  const n = (x: unknown) => (typeof x === 'number' ? x : 0);
  const prompt = (c: Record<string, unknown>) => n(c.input_tokens) + n(c.cache_creation_input_tokens) + n(c.cache_read_input_tokens);
  const its = Array.isArray(u.iterations) ? (u.iterations as Record<string, unknown>[]) : [];
  const last = its.length ? its[its.length - 1] : u;
  const mu = j.modelUsage as Record<string, { contextWindow?: number }> | undefined;
  const window = mu ? (model && mu[model]?.contextWindow) || Math.max(0, ...Object.values(mu).map(m => m.contextWindow ?? 0)) || undefined : undefined;
  return { in: prompt(u), out: n(u.output_tokens), context: prompt(last) + n(last.output_tokens), window };
}
function onClaudeLine(l: Live, line: string) {
  let j: Record<string, unknown>; try { j = JSON.parse(line); } catch { emit(l, { kind: 'stderr', text: line.slice(0, 500) }); return; }
  const type = j.type as string;
  // events produced inside a subagent (the Task tool) carry the parent tool use id; the console nests them under it
  const parent = typeof j.parent_tool_use_id === 'string' && j.parent_tool_use_id ? (j.parent_tool_use_id as string) : undefined;
  if (type === 'system') {
    if (j.subtype === 'init' && typeof j.model === 'string') l.model = j.model;
    if (j.subtype === 'init' && !l.agentSessionId) { l.agentSessionId = j.session_id as string; updateSession(l.productDir, l.id, { agentSessionId: l.agentSessionId }).catch(() => {}); emit(l, { kind: 'init', model: j.model as string, cwd: j.cwd as string, text: `claude ${j.model ?? ''} · ${(j.tools as string[] | undefined)?.length ?? 0} tools` }); }
    return; // init repeats every turn; hooks and rate-limit events are noise for the console
  }
  if (type === 'user') {
    const content = (j.message as { content?: unknown[] })?.content ?? [];
    for (const c of content as Record<string, unknown>[]) {
      if (c.type === 'tool_result') { const out = typeof c.content === 'string' ? c.content : Array.isArray(c.content) ? (c.content as { text?: string }[]).map(x => x.text ?? '').join('\n') : JSON.stringify(c.content); emit(l, { kind: 'tool_result', toolUseId: String(c.tool_use_id), output: String(out).slice(0, 8000), isError: !!c.is_error, parent }); }
    }
    return;
  }
  if (type === 'assistant') {
    const content = (j.message as { content?: unknown[] })?.content ?? [];
    for (const c of content as Record<string, unknown>[]) {
      if (c.type === 'text' && String(c.text).trim()) emit(l, { kind: 'assistant', text: String(c.text), parent });
      else if (c.type === 'thinking' && String(c.thinking ?? '').trim()) emit(l, { kind: 'thinking', text: String(c.thinking).slice(0, 4000), parent });
      else if (c.type === 'tool_use') emit(l, { kind: 'tool_use', name: String(c.name), input: c.input, toolUseId: String(c.id), parent });
    }
    return;
  }
  if (type === 'result') { l.turnBusy = false; endTurn(l, j.is_error ? { error: 'the turn ended with an error' } : undefined); armIdleStop(l); emit(l, { kind: 'result', text: typeof j.result === 'string' ? j.result : '', costUsd: j.total_cost_usd as number, durationMs: j.duration_ms as number, isError: j.is_error as boolean, usage: claudeUsage(j, l.model) }); if (typeof j.total_cost_usd === 'number') updateSession(l.productDir, l.id, { totalCostUsd: j.total_cost_usd }).catch(() => {}); reportKnowledge(l); pump(l); return; }
  if (type === 'control_request') {
    const req = j.request as Record<string, unknown>;
    emit(l, { kind: 'permission', requestId: String(j.request_id), name: String(req.tool_name ?? req.subtype ?? 'tool'), input: req.input, text: String(req.description ?? req.subtype ?? '') });
    return;
  }
  // rate limits, hooks and the rest are noise for the console
}

// Every message goes through the persistent queue; the pump hands the next item (or the whole batch) to the agent
// as soon as it is idle. Items wait across restarts: a resumed agent takes them.
export async function sendMessage(productDir: string, id: string, item: Omit<QueueItem, 'id' | 'addedAt'>): Promise<{ position: number; live: boolean }> {
  const r = await enqueue(productDir, id, item);
  await notifyQueue(productDir, id);
  const l = live().get(id);
  if (l) pump(l);
  return { position: r?.position ?? 0, live: !!l };
}
export function pump(l: Live) {
  if (l.pumping || l.turnBusy || l.stopped) return;
  const running = l.agent === 'codex' ? true : !!l.proc;
  if (!running) return;
  l.pumping = true;
  takeFromQueue(l.productDir, l.id).then(items => {
    l.pumping = false;
    if (!items.length) return;
    l.turn = items.map(i => i.id);
    if (items[0].fresh) { restartFresh(l.productDir, l.product ?? path.basename(l.productDir), l.id, items, { wfUrl: l.wfUrl ?? process.env.WF_URL ?? 'http://localhost:3456' }).catch(() => {}); return; } // the context goes before this item (rule:clean-slate)
    notifyQueue(l.productDir, l.id).catch(() => {});
    const text = queueMessage(items);
    const names = items.flatMap(i => i.images ?? []);
    loadImages(l.productDir, l.id, names).then(imgs => {
      emit(l, { kind: 'user', text: items.length > 1 ? `(batch of ${items.length})\n\n${text}` : text, images: imgs.map(i => `/api/${path.basename(l.productDir)}/sessions/${l.id}/file/${i.name}`) });
      if (l.agent === 'codex') codexTurn(l, l.cwd, text, true, imgs.map(i => i.path)); else writeUser(l, text, imgs);
    });
  }).catch(() => { l.pumping = false; });
}
// After a turn, what the knowledge base got from it: the session's artifacts (documents credited by the disk
// watcher, nodes changed through the API — lib/artifacts) that were not reported yet, as one `knowledge` event.
// The watcher credits a write ~0.5 s after it lands, so the check waits a moment; a late credit shows up after the
// next turn.
function reportKnowledge(l: Live, delay = 1200) {
  setTimeout(() => {
    getSession(l.productDir, l.id).then(s => {
      // blocks first (typed ones as tags; paragraphs counted), then documents and nodes not yet shown
      const blocks = (s?.artifacts?.blocks ?? []).filter(b => !l.known.has(`${b.id}@${b.at}`));
      const typed = blocks.filter(b => !b.id.startsWith('block:'));
      const fresh = [...new Set([...typed.map(b => b.id), ...(s?.artifacts?.docs ?? []), ...(s?.artifacts?.nodes ?? [])])].filter(x => !l.known.has(x));
      if (!fresh.length && !blocks.length) return;
      for (const x of fresh) l.known.add(x);
      for (const b of blocks) l.known.add(`${b.id}@${b.at}`);
      const n = (c: string) => blocks.filter(b => b.change === c).length;
      const counts = [n('added') && `+${n('added')} added`, n('changed') && `${n('changed')} changed`, n('removed') && `${n('removed')} removed`].filter(Boolean).join(' · ');
      emit(l, { kind: 'knowledge', refs: fresh, text: `knowledge: ${counts || fresh.join(', ')}`, changes: blocks.map(b => ({ id: b.id, change: b.change })) });
    }).catch(() => {});
  }, delay);
}
export function pumpSession(id: string) { const l = live().get(id); if (l) pump(l); }
export function answerPermission(id: string, requestId: string, allow: boolean, input?: unknown): boolean {
  const l = live().get(id); if (!l?.proc) return false;
  const response = allow ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: 'denied by the user in Wye' };
  l.proc.stdin!.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }) + '\n');
  emit(l, { kind: 'note', text: `${allow ? 'allowed' : 'denied'} ${requestId}`, requestId, answered: allow ? 'allow' : 'deny', input: allow ? input : undefined });
  return true;
}
// A fresh item comes up (rule:clean-slate, req:wf2.sessions.fresh-in-queue): end the process if one is up (the
// pump only gets here when no turn is open, so nothing in progress is cut), forget the agent's own session id (and
// the Codex thread), mark the transcript, and hand the items — already taken from the queue — to a new process as
// a first message built like a new session's: instruction, refs, link, images, plan-first when the item asks.
export async function restartFresh(productDir: string, product: string, id: string, items: QueueItem[], opts: { wfUrl: string }): Promise<boolean> {
  const s = await getSession(productDir, id); if (!s || !items.length) return false;
  const l = live().get(id);
  if (l) {
    clearIdle(l);
    const old = l.proc; l.proc = null; l.turnBusy = false; l.pumping = false; l.agentSessionId = undefined; l.codexThread = undefined; l.model = undefined;
    if (old) { old.stdin?.end(); setTimeout(() => old.kill(), 1500); } // its close handler sees l.proc !== old and stays quiet
    emit(l, { kind: 'note', text: 'context cleared — a fresh agent takes the next message' });
  }
  await updateSession(productDir, id, { forgetAgentSession: true, line: 'context cleared' });
  await notifyQueue(productDir, id);
  const fresh: Session = { ...s, agentSessionId: undefined, plan: !!items[0].plan, instruction: items.map(i => i.text.trim()).filter(Boolean).join('\n\n---\n\n'), refs: [...new Set(items.flatMap(i => i.refs ?? []))], source: { ...(s.source ?? {}), link: items.find(i => i.link)?.link }, images: items.flatMap(i => i.images ?? []), parent: undefined };
  // a fresh request is new work: the plan it leaves unfinished is closed, and it gets a plan document of its own
  // (rule:plan-doc, decision:wf2.plan-per-request)
  await closePlanDoc(productDir, s).catch(() => {});
  fresh.planDoc = (await createPlanDoc(productDir, product, { ...fresh, planDoc: undefined })) ?? undefined;
  const first = await buildPrompt(product, fresh, opts.wfUrl, productDir);
  const shown = items.length > 1 ? `(batch of ${items.length})\n\n${fresh.instruction}` : fresh.instruction;
  await startChat(productDir, product, id, { wfUrl: opts.wfUrl, firstMessage: first, shown, images: fresh.images });
  const nl = live().get(id); if (nl) nl.turn = items.map(i => i.id); // the first message is this item's turn
  return true;
}
// The open turn ended: stamp its items and forget them.
function endTurn(l: Live, fail?: { error: string }) {
  const ids = l.turn ?? []; l.turn = []; if (!ids.length) return; // an entry from before this shipped has no turn
  markTurnEnd(l.productDir, l.id, ids, fail).then(() => notifyQueue(l.productDir, l.id)).catch(() => {});
}
// Idle stop (rule:idle-stop): a live claude process with no open turn and no queued message for WF_AGENT_IDLE_MIN
// minutes (default 30, 0 disables) is ended — `--resume` brings its context back with the next message or Resume.
export const IDLE_MIN = (() => { const n = Number(process.env.WF_AGENT_IDLE_MIN ?? '30'); return Number.isFinite(n) && n >= 0 ? n : 30; })();
function clearIdle(l: Live) { if (l.idle) { clearTimeout(l.idle); l.idle = undefined; } }
function armIdleStop(l: Live) {
  clearIdle(l);
  if (!IDLE_MIN || l.agent === 'codex') return;
  l.idle = setTimeout(() => {
    l.idle = undefined;
    if (!l.proc || l.turnBusy) return;
    getSession(l.productDir, l.id).then(s => {
      if ((s?.queue ?? []).some(q => !q.sentAt)) { pump(l); return; } // something waits after all
      emit(l, { kind: 'note', text: `idle for ${IDLE_MIN} min — stopped; Resume or a message continues with the same context` });
      updateSession(l.productDir, l.id, { status: 'done', line: `idle for ${IDLE_MIN} min — stopped; Resume or a message continues with the same context` }).catch(() => {});
      l.proc?.stdin?.end(); const p = l.proc; setTimeout(() => p?.kill(), 1500);
    }).catch(() => {});
  }, IDLE_MIN * 60_000);
  l.idle.unref?.();
}
// Stop ends the process; the recorded status is the caller's business (Stop: done, the context comes back with
// Resume; Close: cancelled — req:wf2.sessions.stop-from-list), so the exit handler leaves it alone.
export function stopChat(id: string, note = 'stopped by the user — Resume or a message continues with the same context'): boolean {
  const l = live().get(id); if (!l) return false;
  clearIdle(l); l.stopped = true;
  if (l.proc) { l.proc.stdin?.end(); const p = l.proc; setTimeout(() => p.kill(), 1500); }
  emit(l, { kind: 'note', text: note });
  return true;
}
// Live conversations with no open turn: what "Stop idle" ends.
export function idleIds(): string[] { return [...live().values()].filter(l => isLive(l.id) && !l.turnBusy).map(l => l.id); }

// Codex: one `codex exec --json` process per turn; later turns resume the thread.
function codexTurn(l: Live, cwd: string, text: string, fromQueue = false, imagePaths: string[] = []) {
  if (!fromQueue) emit(l, { kind: 'user', text });
  const imgArgs = imagePaths.flatMap(p => ['--image', p]);
  const args = l.codexThread ? ['exec', 'resume', l.codexThread, '--json', ...imgArgs, text] : ['exec', '--json', '--sandbox', 'workspace-write', ...imgArgs, text];
  const proc = spawn('codex', args, { cwd, env: { ...process.env, WF_SESSION: l.id, WF_PRODUCT: l.productDir.split('/').pop() } });
  l.proc = proc; l.turnBusy = true;
  let buf = '';
  proc.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onCodexLine(l, line); } });
  proc.stderr.on('data', d => { const t = String(d).trim(); if (t && !/^warning:/i.test(t)) emit(l, { kind: 'stderr', text: t.slice(0, 2000) }); });
  proc.on('close', code => { l.proc = null; l.turnBusy = false; endTurn(l, code !== 0 ? { error: `codex turn exited with ${code}` } : undefined); emit(l, { kind: 'result', text: '', code: code ?? -1, isError: code !== 0, usage: l.codexUsage }); l.codexUsage = undefined; if (code !== 0) updateSession(l.productDir, l.id, { line: `codex turn exited with ${code}` }).catch(() => {}); reportKnowledge(l); pump(l); });
}
function onCodexLine(l: Live, line: string) {
  let j: Record<string, unknown>; try { j = JSON.parse(line); } catch { emit(l, { kind: 'stderr', text: line.slice(0, 500) }); return; }
  const type = String(j.type ?? '');
  if (type === 'thread.started') { l.codexThread = String(j.thread_id); updateSession(l.productDir, l.id, { agentSessionId: l.codexThread }).catch(() => {}); emit(l, { kind: 'init', text: `codex thread ${l.codexThread}` }); return; }
  if (type === 'item.completed' || type === 'item.started') {
    const it = (j.item ?? {}) as Record<string, unknown>; const k = String(it.type ?? '');
    if (type === 'item.completed' && k === 'agent_message') emit(l, { kind: 'assistant', text: String(it.text ?? '') });
    else if (type === 'item.completed' && k === 'reasoning') emit(l, { kind: 'thinking', text: String(it.text ?? '').slice(0, 4000) });
    else if (type === 'item.started' && k === 'command_execution') emit(l, { kind: 'tool_use', name: 'Bash', input: { command: it.command }, toolUseId: String(it.id) });
    else if (type === 'item.completed' && k === 'command_execution') emit(l, { kind: 'tool_result', toolUseId: String(it.id), output: String(it.aggregated_output ?? '').slice(0, 8000), isError: Number(it.exit_code) !== 0 });
    else if (type === 'item.completed' && k === 'file_change') emit(l, { kind: 'tool_use', name: 'Edit', input: it.changes, toolUseId: String(it.id) });
    return;
  }
  if (type === 'turn.completed') { const u = j.usage as Record<string, number> | undefined; if (u) l.codexUsage = { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0 }; return; } // codex sums the turn's calls, so no context size
  if (type === 'error' || type === 'turn.failed') emit(l, { kind: 'stderr', text: JSON.stringify(j.error ?? j).slice(0, 1000) });
}

// After a server restart, chat sessions the old process hosted are no longer running: close them once.
const reconciled = new Set<string>();
export async function reconcileStale(productDir: string): Promise<void> {
  if (reconciled.has(productDir)) return; reconciled.add(productDir);
  const { listSessions } = await import('./sessions');
  for (const s of await listSessions(productDir)) {
    if (s.status === 'running' && s.mode === 'chat' && s.runner?.startsWith('app@') && s.runner !== `app@${process.pid}` && !isLive(s.id)) {
      await updateSession(productDir, s.id, { status: 'done', line: 'the app restarted; resume to continue with the same context' }).catch(() => {});
    }
  }
}
