// Shared (browser-safe) session types and the agents that can be chosen.
export type SessionStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface SessionSource { project?: string; doc?: string; blockId?: string; text?: string }
export interface Session { id: string; product: string; agent: string; status: SessionStatus; createdAt: string; updatedAt: string; instruction: string; refs: string[]; source: SessionSource; log: { t: string; line: string }[]; result?: string }

export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'clerk', label: 'Waterfall clerk (knowledge only)' },
];
