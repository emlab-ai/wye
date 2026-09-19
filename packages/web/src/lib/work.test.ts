import { describe, it, expect } from 'vitest';
import { indexGraph, type GraphData, type GraphNode } from './graph';
import { workItems, filterWork, groupWork, workCounts, nextReady, stateOf, assignRefusal, type WorkSession } from './work';

const F = 'data/products/p/projects/v2/docs';
const node = (id: string, kind: string, file: string, line: number, body: string, status = '', extra: Partial<GraphNode> = {}): GraphNode => ({ id, kind, title: id.split(':')[1], status, section: '', subsection: '', body, defined: true, file, line, ...extra });
const g: GraphData = {
  generatedAt: '', files: [], fieldIndex: {},
  modules: [{ id: 'plan:plan-a', title: 'A', file: `${F}/plan-a.md`, verified: '', sourceRoots: [] }, { id: 'module:prd', title: 'PRD', file: `${F}/prd.md`, verified: '', sourceRoots: [] }],
  nodes: [
    node('plan:plan-a', 'plan', `${F}/plan-a.md`, 1, 'id: plan:plan-a\nsession: s1', 'building'),
    node('task:plan-a', 'task', `${F}/plan-a.md`, 20, 'id: task:plan-a\ntext: do A\nworker: claude-code\nsession: s1\npart-of: goal:g', 'in-progress'),
    node('task:a.step', 'task', `${F}/plan-a.md`, 21, 'id: task:a.step\ntext: step one part of plan:plan-a', 'open'),
    node('task:a.sub', 'task', `${F}/plan-a.md`, 22, 'id: task:a.sub\ntext: sub of step part of task:a.step', 'open'),
    node('task:x.free', 'task', `${F}/prd.md`, 5, 'id: task:x.free\ntext: free task\nready: true\npriority: 1', 'todo'),
    node('task:x.blocked', 'task', `${F}/prd.md`, 6, 'id: task:x.blocked\ntext: waits\nready: true\nblocked-by: task:x.free', 'todo'),
    node('task:x.held', 'task', `${F}/prd.md`, 7, 'id: task:x.held\ntext: alex has it\nworker: alex', 'open'),
    node('task:x.done', 'task', `${F}/prd.md`, 8, 'id: task:x.done\ntext: finished', 'done'),
    node('task:x.stalled', 'task', `${F}/prd.md`, 9, 'id: task:x.stalled\ntext: crashed\nsession: s2', 'in-progress'),
    node('task:x.queued', 'task', `${F}/prd.md`, 10, 'id: task:x.queued\ntext: waits for a runner\nworker: codex', 'todo'),
    node('goal:g', 'goal', `${F}/prd.md`, 2, 'id: goal:g', 'proposed'),
  ],
  edges: [
    { from: 'task:plan-a', to: 'goal:g', verb: 'part-of' },
    { from: 'task:a.step', to: 'plan:plan-a', verb: 'part-of' },
    { from: 'task:a.sub', to: 'task:a.step', verb: 'part-of' },
    { from: 'task:x.blocked', to: 'task:x.free', verb: 'blocked-by' },
  ],
};
const sessions: WorkSession[] = [
  { id: 's1', status: 'running', agent: 'claude-code', refs: ['task:plan-a'], createdAt: '2026-09-19T10:00:00Z', artifacts: { blocks: [{ id: 'req:x' }, { id: 'decision:y' }] } },
  { id: 's2', status: 'failed', agent: 'codex', refs: [], createdAt: '2026-09-19T09:00:00Z' },
  { id: 's3', status: 'queued', agent: 'codex', refs: ['task:x.queued'], createdAt: '2026-09-19T11:00:00Z' },
];
const idx = indexGraph(g);
const rows = workItems(g, idx, sessions);
const find = (id: string) => { const flat: typeof rows = []; const walk = (r: typeof rows[0]) => { flat.push(r); r.children.forEach(walk); }; rows.forEach(walk); return flat.find(r => r.id === id)!; };

describe('workItems (req:exec.work-view, req:exec.work-states)', () => {
  it('derives the state from the sessions on the task, the status stays the line\'s', () => {
    expect(find('task:plan-a')).toMatchObject({ status: 'in-progress', state: 'working', worker: 'claude-code', requestTask: true, produced: 2, partOf: ['goal:g'] });
    expect(find('task:x.stalled').state).toBe('stalled');
    expect(find('task:x.queued').state).toBe('queued');
    expect(find('task:x.held').state).toBe('held');
    expect(find('task:x.free')).toMatchObject({ state: 'unassigned', ready: true, priority: 1 });
    expect(find('task:x.done').state).toBe('done');
    expect(stateOf('open', undefined, [])).toBe('unassigned');
  });
  it('nests a plan\'s tasks under its request task and sub-tasks under their task; priority orders roots', () => {
    const req = rows.find(r => r.id === 'task:plan-a')!;
    expect(req.children.map(c => c.id)).toEqual(['task:a.step']);
    expect(req.children[0].children.map(c => c.id)).toEqual(['task:a.sub']);
    expect(rows[0].id).toBe('task:x.free'); // priority 1 first, then document order
    expect(find('task:x.blocked')).toMatchObject({ blocked: true, blockedBy: ['task:x.free'] });
  });
  it('filters: done hidden by default, mine, goal, plan, search; groups by status with review first', () => {
    expect(filterWork(rows, {}).some(r => r.id === 'task:x.done')).toBe(false);
    expect(filterWork(rows, { done: true }).some(r => r.id === 'task:x.done')).toBe(true);
    expect(filterWork(rows, { mine: 'alex' }).map(r => r.id)).toEqual(['task:x.held']);
    expect(filterWork(rows, { goal: 'goal:g' }).map(r => r.id)).toEqual(['task:plan-a']);
    expect(filterWork(rows, { plan: 'plan:plan-a', q: 'sub' }).map(r => r.id)).toEqual(['task:plan-a']); // the parent kept for its matching child
    const groups = groupWork(filterWork(rows, {}), 'status');
    expect(groups.map(([k]) => k)).toEqual(['in-progress', 'open', 'todo']);
    expect(groupWork(rows, 'worker').map(([k]) => k)).toEqual(['alex', 'claude-code', 'codex', '— unassigned']);
    expect(workCounts(rows).state.working).toBe(1);
  });
  it('nextReady takes the oldest ready, unblocked, unassigned task and refuses done or blocked tasks on assign', () => {
    expect(nextReady(rows)?.id).toBe('task:x.free');
    expect(nextReady(rows, 'goal:g')).toBeNull();
    expect(assignRefusal(find('task:x.done'))).toBe('the task is done');
    expect(assignRefusal(find('task:x.blocked'))).toMatch(/blocked by task:x.free/);
    expect(assignRefusal(find('task:x.free'))).toBeNull();
  });
});
