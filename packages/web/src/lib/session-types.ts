// Shared (browser-safe) session types and the agents that can be chosen.
export type SessionStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface SessionSource { project?: string; doc?: string; blockId?: string; text?: string; link?: string }
// mode 'run': a runner executes the instruction once and streams its output to the log.
// mode 'chat': the app itself hosts the agent process and the session is a live conversation (transcript of events).
export type SessionMode = 'run' | 'chat';
// Work waiting for the agent: sent one at a time (batch 'one') or all pending items joined into one message ('all').
// An item keeps its life on the session record (decision:wf2.queue-item-state): addedAt → sentAt (handed to the
// agent, its turn is open) → doneAt | failedAt (that turn ended; `error` says how it failed). `fresh` asks the host
// to restart the agent from nothing before handing the item over (rule:clean-slate), `plan` for the plan-first
// section in that first message.
export interface QueueItem { id: string; text: string; refs?: string[]; link?: string; images?: string[]; addedAt: string; sentAt?: string; doneAt?: string; failedAt?: string; error?: string; fresh?: boolean; plan?: boolean }
export type QueueState = 'waiting' | 'working' | 'done' | 'failed';
export const queueState = (q: Pick<QueueItem, 'sentAt' | 'doneAt' | 'failedAt'>): QueueState => q.failedAt ? 'failed' : q.doneAt ? 'done' : q.sentAt ? 'working' : 'waiting';
// What the console and the Agents page show of a queue: every item with its state (no refs, links or images).
export type QueueItemView = { id: string; text: string; addedAt: string; sentAt?: string; doneAt?: string; failedAt?: string; error?: string; fresh?: boolean; plan?: boolean; state: QueueState };
export type QueueView = { items: QueueItemView[]; batch: 'one' | 'all' };
export const queueView = (items: QueueItem[] | undefined, batch: 'one' | 'all' | undefined): QueueView => ({ items: (items ?? []).map(q => ({ id: q.id, text: q.text, addedAt: q.addedAt, sentAt: q.sentAt, doneAt: q.doneAt, failedAt: q.failedAt, error: q.error, fresh: q.fresh, plan: q.plan, state: queueState(q) })), batch: batch ?? 'one' });
// "1 working · 2 waiting · 5 done" — the states that have items, in that order; failed counts as well
export const queueSummary = (items: Pick<QueueItem, 'sentAt' | 'doneAt' | 'failedAt'>[]): string => {
  const n: Record<QueueState, number> = { working: 0, waiting: 0, done: 0, failed: 0 };
  for (const q of items) n[queueState(q)]++;
  return (['working', 'waiting', 'done', 'failed'] as QueueState[]).filter(k => n[k]).map(k => `${n[k]} ${k}`).join(' · ');
};
// Which pending items go to the agent next: one (batch 'one') or all of them (batch 'all') — but a fresh item is
// handed alone, so items queued before it go first as their own batch and the fresh one waits for the next take.
export const nextTake = <T extends Pick<QueueItem, 'sentAt' | 'fresh'>>(queue: T[], batch: 'one' | 'all' | undefined): T[] => {
  const pending = queue.filter(q => !q.sentAt); if (!pending.length) return [];
  if (batch !== 'all' || pending[0].fresh) return pending.slice(0, 1);
  const i = pending.findIndex(q => q.fresh);
  return i === -1 ? pending : pending.slice(0, i);
};
// plan: the agent understands and proposes before it builds (rule:plan-first) — set by the command palette
// a block the session added, changed or removed (req:wf2.sessions.block-attribution)
export type BlockChange = { id: string; change: 'added' | 'changed' | 'removed'; doc: string; title: string; at: string };
// task: the task this session was assigned (req:exec.dispatch) — its plan document embeds it instead of writing a
// request task; role: worker (builds) or librarian (reads Wye, explains, proposes — never code; decision:exec.wye-is-a-role)
export type SessionRole = 'worker' | 'librarian';
export interface Session { id: string; product: string; agent: string; mode?: SessionMode; plan?: boolean; planDoc?: string; task?: string; role?: SessionRole; queue?: QueueItem[]; batch?: 'one' | 'all'; status: SessionStatus; createdAt: string; updatedAt: string; instruction: string; refs: string[]; source: SessionSource; log: { t: string; line: string }[]; result?: string; runner?: string; startedAt?: string; finishedAt?: string; parent?: string; children?: string[]; cwd?: string; images?: string[]; agentSessionId?: string; transcript?: ChatEvent[]; totalCostUsd?: number; artifacts?: { docs: string[]; nodes: string[]; blocks?: BlockChange[] }; live?: boolean; busy?: boolean; plans?: SessionPlan[] }
// A worker's work items (decision:wf2.plan-per-request): the plan documents whose `session` names this session, read
// from the graph by the API — not stored on the record.
export type SessionPlan = { ref: string; node: string; title: string; status: string; started?: string; finished?: string; tasks: { done: number; total: number } };
// A conversation's process may outlive its recorded status: `wf session done` marks the work done while claude or codex
// stays up to take the next message. `live`/`busy` come from the API (agent-host#liveState), never from disk.
// Tokens of one turn: `in` everything the model read (fresh, cache writes and cache reads), `out` what it wrote,
// `context` the prompt size of the turn's last call (how full the context is), `window` the model's limit.
export type TurnUsage = { in: number; out: number; context?: number; window?: number }
// One thing that happened in a chat session, normalised across agents. `raw` keeps the agent's own event (trimmed).
// prompt: on the first `user` event, the full message the agent received when it is more than `text` — the request
// wrapped in the Wye preamble (req:wf2.console.first-message-is-the-request); the console shows it behind a fold
export type ChatEvent = { t: string; kind: 'init' | 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'permission' | 'stderr' | 'exit' | 'note' | 'log' | 'summary' | 'open' | 'knowledge'; text?: string; prompt?: string; refs?: string[]; usage?: TurnUsage; name?: string; input?: unknown; output?: string; isError?: boolean; toolUseId?: string; requestId?: string; answered?: 'allow' | 'deny'; model?: string; cwd?: string; costUsd?: number; durationMs?: number; code?: number; parent?: string; images?: string[]; changes?: { id: string; change: BlockChange['change'] }[] }
// A runner is a process that executes sessions for one agent (wf agent listen); it heartbeats every few seconds.
export interface Runner { name: string; agent: string; host: string; pid: number; cwd: string; startedAt: string; seenAt: string; busy?: string }

export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'clerk', label: 'Wye clerk (knowledge only)' },
];
