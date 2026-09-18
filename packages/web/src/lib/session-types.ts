// Shared (browser-safe) session types and the agents that can be chosen.
export type SessionStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface SessionSource { project?: string; doc?: string; blockId?: string; text?: string; link?: string }
// mode 'run': a runner executes the instruction once and streams its output to the log.
// mode 'chat': the app itself hosts the agent process and the session is a live conversation (transcript of events).
export type SessionMode = 'run' | 'chat';
// Work waiting for the agent: sent one at a time (batch 'one') or all pending items joined into one message ('all').
export interface QueueItem { id: string; text: string; refs?: string[]; link?: string; images?: string[]; addedAt: string; sentAt?: string }
// plan: the agent understands and proposes before it builds (rule:plan-first) — set by the command palette
// a block the session added, changed or removed (req:wf2.sessions.block-attribution)
export type BlockChange = { id: string; change: 'added' | 'changed' | 'removed'; doc: string; title: string; at: string };
export interface Session { id: string; product: string; agent: string; mode?: SessionMode; plan?: boolean; queue?: QueueItem[]; batch?: 'one' | 'all'; status: SessionStatus; createdAt: string; updatedAt: string; instruction: string; refs: string[]; source: SessionSource; log: { t: string; line: string }[]; result?: string; runner?: string; startedAt?: string; finishedAt?: string; parent?: string; children?: string[]; cwd?: string; images?: string[]; agentSessionId?: string; transcript?: ChatEvent[]; totalCostUsd?: number; artifacts?: { docs: string[]; nodes: string[]; blocks?: BlockChange[] }; live?: boolean; busy?: boolean }
// A conversation's process may outlive its recorded status: `wf session done` marks the work done while claude or codex
// stays up to take the next message. `live`/`busy` come from the API (agent-host#liveState), never from disk.
// Tokens of one turn: `in` everything the model read (fresh, cache writes and cache reads), `out` what it wrote,
// `context` the prompt size of the turn's last call (how full the context is), `window` the model's limit.
export type TurnUsage = { in: number; out: number; context?: number; window?: number }
// One thing that happened in a chat session, normalised across agents. `raw` keeps the agent's own event (trimmed).
export type ChatEvent = { t: string; kind: 'init' | 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'permission' | 'stderr' | 'exit' | 'note' | 'log' | 'summary' | 'open' | 'knowledge'; text?: string; refs?: string[]; usage?: TurnUsage; name?: string; input?: unknown; output?: string; isError?: boolean; toolUseId?: string; requestId?: string; answered?: 'allow' | 'deny'; model?: string; cwd?: string; costUsd?: number; durationMs?: number; code?: number; parent?: string; images?: string[]; changes?: { id: string; change: BlockChange['change'] }[] }
// A runner is a process that executes sessions for one agent (wf agent listen); it heartbeats every few seconds.
export interface Runner { name: string; agent: string; host: string; pid: number; cwd: string; startedAt: string; seenAt: string; busy?: string }

export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'clerk', label: 'Waterfall clerk (knowledge only)' },
];
