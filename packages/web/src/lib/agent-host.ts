// The agent host: the app runs Claude Code / Codex as child processes for chat sessions, keeps the conversation
// open, turns their streaming JSON into ChatEvents, persists them to the session and pushes them to subscribers.
// Lives on globalThis so dev-server module reloads do not orphan the processes.
import { spawn, type ChildProcess } from 'node:child_process';
import { getSession, updateSession, appendTranscript, enqueue, takeFromQueue, queueMessage, filesDir } from './sessions';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatEvent, Session } from './session-types';
import { loadScope } from './scope';
import { resolveLink, renderResolved } from './resolve';
import { REPO_ROOT } from './products';
import { agentSystemPrompt } from './agent-prompt';

type Live = { id: string; productDir: string; agent: string; cwd: string; proc: ChildProcess | null; subs: Set<(e: ChatEvent) => void>; pending: ChatEvent[]; flush: ReturnType<typeof setTimeout> | null; agentSessionId?: string; turnBusy: boolean; pumping: boolean; codexThread?: string };
const g = globalThis as unknown as { __wfAgentHost?: Map<string, Live> };
const live = () => (g.__wfAgentHost ??= new Map<string, Live>());

export function isLive(id: string): boolean { const l = live().get(id); return !!l && (!!l.proc || l.agent === 'codex'); }
export function liveIds(): string[] { return [...live().keys()]; }

function emit(l: Live, e: Omit<ChatEvent, 't'> & { t?: string }) {
  const ev = { t: new Date().toISOString(), ...e } as ChatEvent;
  for (const fn of l.subs) { try { fn(ev); } catch { /* subscriber gone */ } }
  l.pending.push(ev);
  if (!l.flush) l.flush = setTimeout(() => { const batch = l.pending; l.pending = []; l.flush = null; appendTranscript(l.productDir, l.id, batch).catch(() => {}); }, 400);
}

export type QueueListener = (q: { pending: { id: string; text: string; addedAt: string }[]; batch: 'one' | 'all' }) => void;
const queueSubs = (globalThis as unknown as { __wfQueueSubs?: Map<string, Set<QueueListener>> }).__wfQueueSubs ??= new Map();
export function subscribeQueue(id: string, fn: QueueListener): () => void { if (!queueSubs.has(id)) queueSubs.set(id, new Set()); queueSubs.get(id)!.add(fn); return () => { queueSubs.get(id)?.delete(fn); }; }
export async function notifyQueue(productDir: string, id: string) { const s = await getSession(productDir, id); if (!s) return; const q = { pending: (s.queue ?? []).filter(x => !x.sentAt).map(x => ({ id: x.id, text: x.text, addedAt: x.addedAt })), batch: s.batch ?? 'one' as const }; for (const fn of queueSubs.get(id) ?? []) { try { fn(q); } catch { /* gone */ } } }

export function subscribe(id: string, fn: (e: ChatEvent) => void): () => void {
  const l = live().get(id); if (!l) return () => {};
  l.subs.add(fn); return () => { l.subs.delete(fn); };
}

// The first message: the instruction plus every ref and the source link resolved to text, and how to talk back.
export async function buildPrompt(product: string, s: Session, wfUrl: string): Promise<string> {
  const scope = await loadScope(product);
  const parts = [`You are working on the product "${product}" in Waterfall (requirements, rules, decisions, goals and tasks kept as markdown; the app at ${wfUrl} shows this conversation live). Session ${s.id}.`, `\n## Instruction\n${s.instruction}`];
  const ctx: string[] = []; const seen = new Set<string>();
  for (const ref of [...(s.source?.link ? [s.source.link] : []), ...s.refs]) {
    if (seen.has(ref) || !scope) continue; seen.add(ref);
    try { const j = await resolveLink(scope, ref); ctx.push(j ? renderResolved(ref, j) : `- ${ref}: not found`); } catch (e) { ctx.push(`- ${ref}: could not resolve (${e instanceof Error ? e.message : e})`); }
  }
  if (ctx.length) parts.push(`\n## Context\n${ctx.join('\n\n')}`);
  if (s.parent) parts.push(`\nThis session continues session ${s.parent}; its log and result are in the instruction above.`);
  parts.push(`\n## How to work\n- The Waterfall CLI is \`wf\` (WF_URL=${wfUrl}, WF_PRODUCT=${product}). Read: \`wf resolve <link|id>\`, \`wf doc <product/project/doc>\`, \`wf node <id>\`, \`wf context "<text>"\`. Write: \`wf node set <id> --status s --set key=value\`, \`wf doc write <product/project/doc> --file f\`.\n- Product documents live under ${REPO_ROOT}/data/products/${product}/projects/<project>/docs/ (markdown; a line that starts with an id defines that node; keep ids stable). Run \`ctx --root data/products/${product} check\` from ${REPO_ROOT} after editing them.\n- This is a conversation: the person can reply here. Ask when something is unclear; say plainly what you changed.`);
  return parts.join('\n');
}

// Start (or resume) the agent process for a chat session and send the first message.
export async function startChat(productDir: string, product: string, id: string, opts: { wfUrl: string; firstMessage?: string; resume?: boolean }): Promise<Session | null> {
  const s = await getSession(productDir, id); if (!s) return null;
  if (live().get(id)?.proc) return s;
  const cwd = s.cwd || REPO_ROOT;
  const l: Live = { id, productDir, agent: s.agent, cwd, proc: null, subs: new Set(), pending: [], flush: null, agentSessionId: s.agentSessionId, turnBusy: false, pumping: false, codexThread: s.agent === 'codex' ? s.agentSessionId : undefined };
  live().set(id, l);
  const first = opts.firstMessage ?? (opts.resume ? undefined : await buildPrompt(product, s, opts.wfUrl));
  const system = await agentSystemPrompt(product, productDir, opts.wfUrl);
  await updateSession(productDir, id, { status: 'running', runner: `app@${process.pid}`, line: opts.resume ? 'resumed' : 'started in the app', cwd });
  if (s.agent === 'codex') {
    // codex exec has no system-prompt flag: the contract opens the first turn
    emit(l, { kind: 'note', text: `codex in ${cwd}` });
    if (first) codexTurn(l, cwd, l.codexThread ? first : `${system}\n\n---\n\n${first}`); else pump(l);
    return getSession(productDir, id);
  }
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio', '--forward-subagent-text', '--append-system-prompt', system, '--add-dir', REPO_ROOT];
  if (opts.resume && s.agentSessionId) args.push('--resume', s.agentSessionId);
  const proc = spawn('claude', args, { cwd, env: { ...process.env, WF_URL: opts.wfUrl, WF_PRODUCT: product, WF_SESSION: id } });
  l.proc = proc;
  emit(l, { kind: 'note', text: `claude ${opts.resume ? 'resumed' : 'started'} in ${cwd} · Waterfall contract applied as system prompt` });
  let buf = '';
  proc.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onClaudeLine(l, line); } });
  proc.stderr.on('data', d => { const t = String(d).trim(); if (t) emit(l, { kind: 'stderr', text: t.slice(0, 2000) }); });
  proc.on('close', code => { emit(l, { kind: 'exit', code: code ?? -1, text: `claude exited (${code})` }); l.proc = null; getSession(productDir, id).then(cur => { if (cur?.status === 'cancelled') return; return updateSession(productDir, id, { status: code === 0 ? 'done' : 'failed', line: `agent exited with ${code}` }); }).catch(() => {}); });
  proc.stdin.on('error', () => {});
  if (first) { emit(l, { kind: 'user', text: first }); writeUser(l, first); } else setTimeout(() => pump(l), 500); // a resumed agent takes what waited in the queue
  return getSession(productDir, id);
}

function writeUser(l: Live, text: string, images: { mediaType: string; data: string }[] = []) {
  if (!l.proc) return;
  l.turnBusy = true;
  const content: unknown[] = [{ type: 'text', text }, ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))];
  l.proc.stdin!.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
}
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
async function loadImages(productDir: string, id: string, names: string[]): Promise<{ name: string; path: string; mediaType: string; data: string }[]> {
  const out = [];
  for (const n of names) { try { const p = path.join(filesDir(productDir, id), n); out.push({ name: n, path: p, mediaType: MIME[n.split('.').pop()!] ?? 'image/png', data: (await readFile(p)).toString('base64') }); } catch { /* gone */ } }
  return out;
}

function onClaudeLine(l: Live, line: string) {
  let j: Record<string, unknown>; try { j = JSON.parse(line); } catch { emit(l, { kind: 'stderr', text: line.slice(0, 500) }); return; }
  const type = j.type as string;
  // events produced inside a subagent (the Task tool) carry the parent tool use id; the console nests them under it
  const parent = typeof j.parent_tool_use_id === 'string' && j.parent_tool_use_id ? (j.parent_tool_use_id as string) : undefined;
  if (type === 'system') {
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
  if (type === 'result') { l.turnBusy = false; emit(l, { kind: 'result', text: typeof j.result === 'string' ? j.result : '', costUsd: j.total_cost_usd as number, durationMs: j.duration_ms as number, isError: j.is_error as boolean }); if (typeof j.total_cost_usd === 'number') updateSession(l.productDir, l.id, { totalCostUsd: j.total_cost_usd }).catch(() => {}); pump(l); return; }
  if (type === 'control_request') {
    const req = j.request as Record<string, unknown>;
    emit(l, { kind: 'permission', requestId: String(j.request_id), name: String(req.tool_name ?? req.subtype ?? 'tool'), input: req.input, text: String(req.description ?? req.subtype ?? '') });
    return;
  }
  // rate limits, hooks and the rest are noise for the console
}

// Every message goes through the persistent queue; the pump hands the next item (or the whole batch) to the agent
// as soon as it is idle. Items wait across restarts: a resumed agent takes them.
export async function sendMessage(productDir: string, id: string, item: { text: string; refs?: string[]; link?: string; images?: string[] }): Promise<{ position: number; live: boolean }> {
  const r = await enqueue(productDir, id, item);
  await notifyQueue(productDir, id);
  const l = live().get(id);
  if (l) pump(l);
  return { position: r?.position ?? 0, live: !!l };
}
export function pump(l: Live) {
  if (l.pumping || l.turnBusy) return;
  const running = l.agent === 'codex' ? true : !!l.proc;
  if (!running) return;
  l.pumping = true;
  takeFromQueue(l.productDir, l.id).then(items => {
    l.pumping = false;
    if (!items.length) return;
    notifyQueue(l.productDir, l.id).catch(() => {});
    const text = queueMessage(items);
    const names = items.flatMap(i => i.images ?? []);
    loadImages(l.productDir, l.id, names).then(imgs => {
      emit(l, { kind: 'user', text: items.length > 1 ? `(batch of ${items.length})\n\n${text}` : text, images: imgs.map(i => `/api/${path.basename(l.productDir)}/sessions/${l.id}/file/${i.name}`) });
      if (l.agent === 'codex') codexTurn(l, l.cwd, text, true, imgs.map(i => i.path)); else writeUser(l, text, imgs);
    });
  }).catch(() => { l.pumping = false; });
}
export function pumpSession(id: string) { const l = live().get(id); if (l) pump(l); }
export function answerPermission(id: string, requestId: string, allow: boolean, input?: unknown): boolean {
  const l = live().get(id); if (!l?.proc) return false;
  const response = allow ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: 'denied by the user in Waterfall' };
  l.proc.stdin!.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }) + '\n');
  emit(l, { kind: 'note', text: `${allow ? 'allowed' : 'denied'} ${requestId}`, requestId, answered: allow ? 'allow' : 'deny', input: allow ? input : undefined });
  return true;
}
export function stopChat(id: string): boolean {
  const l = live().get(id); if (!l) return false;
  if (l.proc) { l.proc.stdin?.end(); setTimeout(() => l.proc?.kill(), 1500); }
  emit(l, { kind: 'note', text: 'stopped by the user' });
  return true;
}

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
  proc.on('close', code => { l.proc = null; l.turnBusy = false; emit(l, { kind: 'result', text: '', code: code ?? -1, isError: code !== 0 }); if (code !== 0) updateSession(l.productDir, l.id, { line: `codex turn exited with ${code}` }).catch(() => {}); pump(l); });
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
  if (type === 'turn.completed') { const u = j.usage as Record<string, number> | undefined; if (u) emit(l, { kind: 'note', text: `turn done · ${u.input_tokens ?? 0} in / ${u.output_tokens ?? 0} out tokens` }); return; }
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
