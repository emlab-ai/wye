// Shared (browser-safe) session types and the agents that can be chosen.
export type SessionStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface SessionSource { project?: string; doc?: string; blockId?: string; text?: string; link?: string }
export interface Session { id: string; product: string; agent: string; status: SessionStatus; createdAt: string; updatedAt: string; instruction: string; refs: string[]; source: SessionSource; log: { t: string; line: string }[]; result?: string; runner?: string; startedAt?: string; finishedAt?: string; parent?: string; children?: string[] }
// A runner is a process that executes sessions for one agent (wf agent listen); it heartbeats every few seconds.
export interface Runner { name: string; agent: string; host: string; pid: number; cwd: string; startedAt: string; seenAt: string; busy?: string }

export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'clerk', label: 'Waterfall clerk (knowledge only)' },
];
