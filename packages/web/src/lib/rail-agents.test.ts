import { describe, it, expect } from 'vitest';
import { railAgents, elapsed } from './rail-agents';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const s = (o: Record<string, unknown>) => ({ id: 'x', agent: 'claude-code', status: 'running', createdAt: '2026-10-03T11:58:00Z', instruction: 'Fix the login page\nmore', log: [], ...o });

describe('railAgents', () => {
  it('lists only what runs now — running, queued or live — newest first', () => {
    const rows = railAgents([s({ id: 'a', createdAt: '2026-10-03T11:00:00Z' }), s({ id: 'b', status: 'done' }), s({ id: 'c', status: 'done', live: true, createdAt: '2026-10-03T11:30:00Z' }), s({ id: 'd', status: 'queued' }), s({ id: 'e', status: 'cancelled' })], NOW);
    expect(rows.map(r => r.id)).toEqual(['d', 'c', 'a']);
  });
  it('says what state each is in', () => {
    const [w, i, q, a] = railAgents([s({ id: 'w', live: true, busy: true }), s({ id: 'i', live: true, busy: false, createdAt: '2026-10-03T11:57:00Z' }), s({ id: 'q', status: 'queued', createdAt: '2026-10-03T11:56:00Z' }), s({ id: 'a', live: true, busy: false, asking: { text: 'Which product?' }, createdAt: '2026-10-03T11:55:00Z' })], NOW);
    expect([w.state, i.state, q.state, a.state]).toEqual(['working', 'idle', 'queued', 'asking']);
    expect(a.doing).toBe('waiting for you: Which product?');
  });
  it('titles a session by its request, else the first line of what it was told', () => {
    const [p, t] = railAgents([s({ id: 'p', instruction: '', prs: [{ title: 'Executive assistant', ref: 'p/cr/~pr-3' }] }), s({ id: 't', createdAt: '2026-10-03T11:50:00Z', instruction: 'Work on task:pr-3: build the brief\n\ndetails' })], NOW);
    expect(p.title).toBe('Executive assistant');
    expect(t.title).toBe('build the brief');
  });
  it('a build is titled by the request it builds; "Work on <id>. text" by the text', () => {
    const [b, w] = railAgents([s({ id: 'b', instruction: 'Work on task:pr-3: i want to make my…\n\nIt is on the plan pr:3 ("Executive assistant skill and workflows").' }), s({ id: 'w', createdAt: '2026-10-03T11:50:00Z', instruction: 'Work on req:ea.weekly-pace.  A director sees every project\'s pace once a week' })], NOW);
    expect(b.title).toBe('Executive assistant skill and workflows');
    expect(w.title).toBe('A director sees every project\'s pace once a week');
  });
  it('a hook task keeps its own line over the request it belongs to; a bare "Work on <id>." takes the next line', () => {
    const [h, n] = railAgents([s({ id: 'h', prs: [{ title: 'Executive assistant' }], instruction: 'Work on task:p.define-test-cases-3: Define test cases for A director walks into a 1:1\n\nIt is on the plan pr:3 ("Executive assistant").' }), s({ id: 'n', createdAt: '2026-10-03T11:50:00Z', instruction: 'Work on req:ea.weekly-pace.\n\nA director sees every project\'s pace once a week' })], NOW);
    expect(h.title).toBe('Define test cases for A director walks into a 1:1');
    expect(n.title).toBe('A director sees every project\'s pace once a week');
  });
  it('shows what it is doing from its last log line, skipping the app\'s own status lines', () => {
    const [r] = railAgents([s({ log: [{ t: '', line: 'Assistant engine: intake, briefs' }, { t: '', line: 'started in the app' }] })], NOW);
    expect(r.doing).toBe('Assistant engine: intake, briefs');
  });
  it('elapsed reads like the rest of the app', () => {
    expect(elapsed('2026-10-03T11:58:00Z', NOW)).toBe('2m'); expect(elapsed('2026-10-03T10:30:00Z', NOW)).toBe('1h 30m');
    expect(elapsed('2026-10-03T11:59:40Z', NOW)).toBe('now'); expect(elapsed('2026-10-01T12:00:00Z', NOW)).toBe('2d');
  });
});
