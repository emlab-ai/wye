// Shared (browser-safe) session types and the agents that can be chosen.
export type SessionStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface SessionSource { project?: string; doc?: string; blockId?: string; text?: string; link?: string }
// mode 'run': a runner executes the instruction once and streams its output to the log.
// mode 'chat': the app itself hosts the agent process and the session is a live conversation (transcript of events).
export type SessionMode = 'run' | 'chat';
export interface Session { id: string; product: string; agent: string; mode?: SessionMode; status: SessionStatus; createdAt: string; updatedAt: string; instruction: string; refs: string[]; source: SessionSource; log: { t: string; line: string }[]; result?: string; runner?: string; startedAt?: string; finishedAt?: string; parent?: string; children?: string[]; cwd?: string; agentSessionId?: string; transcript?: ChatEvent[]; totalCostUsd?: number }
// One thing that happened in a chat session, normalised across agents. `raw` keeps the agent's own event (trimmed).
export type ChatEvent = { t: string; kind: 'init' | 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'permission' | 'stderr' | 'exit' | 'note'; text?: string; name?: string; input?: unknown; output?: string; isError?: boolean; toolUseId?: string; requestId?: string; answered?: 'allow' | 'deny'; model?: string; cwd?: string; costUsd?: number; durationMs?: number; code?: number }
// A runner is a process that executes sessions for one agent (wf agent listen); it heartbeats every few seconds.
export interface Runner { name: string; agent: string; host: string; pid: number; cwd: string; startedAt: string; seenAt: string; busy?: string }

export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'clerk', label: 'Waterfall clerk (knowledge only)' },
];
