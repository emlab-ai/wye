import { describe, it, expect } from 'vitest';
import { sessionPage } from './session-page';
import type { GraphData, GraphNode } from './graph';
import type { Session } from './session-types';

const N = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/plan.md', line: 1, ...over });
const G = (nodes: GraphNode[], edges: GraphData['edges'] = []): GraphData => ({ generatedAt: '', modules: [], files: [], nodes, edges, fieldIndex: {} });
const S = (over: Partial<Session> = {}): Session => ({ id: 'abc123', product: 'p', agent: 'claude-code', mode: 'chat', status: 'done', createdAt: 't0', updatedAt: 't9', instruction: 'do it', refs: [], source: {}, log: [], ...over });
const b = (id: string, change: 'added' | 'changed' | 'removed', at = 't1', doc = 'module:plan') => ({ id, change, doc, title: id, at });

describe('sessionPage', () => {
  it('todo rows: tasks the session added or changed, its task refs and tasks whose session: names it — joined with the graph, once each', () => {
    const g = G([
      N('task:a', { title: 'A', status: 'open', body: 'text: A' }),
      N('task:b', { title: 'B', status: 'done', body: 'text: B\nsession: xyz abc123' }),
      N('task:c', { title: 'C', status: 'open', body: 'text: C' }),
      N('task:other', { title: 'O', status: 'open', body: 'text: O\nsession: zzz' }),
      N('goal:g', { title: 'Goal' }),
    ], [{ from: 'task:a', to: 'goal:g', verb: 'part-of' }, { from: 'task:c', to: 'req:r', verb: 'part-of' }]);
    const s = S({ refs: ['task:c', 'req:r'], artifacts: { docs: [], nodes: [], blocks: [b('task:a', 'added'), b('task:c', 'changed', 't2'), b('req:r', 'added')] } });
    const p = sessionPage(s, g);
    expect(p.todo.map(t => [t.id, t.title, t.done, t.partOf, t.change])).toEqual([
      ['task:a', 'A', false, 'goal:g', 'added'],
      ['task:c', 'C', false, 'req:r', 'changed'],
      ['task:b', 'B', true, undefined, undefined],
    ]);
    expect(p.todoDone).toBe(1);
  });
  it('a task the session added that is gone from the documents is kept, marked gone', () => {
    const p = sessionPage(S({ artifacts: { docs: [], nodes: [], blocks: [b('task:gone', 'added')] } }), G([]));
    expect(p.todo).toEqual([{ id: 'task:gone', title: 'task:gone', done: false, exists: false, change: 'added', status: '', doc: 'module:plan' }]);
  });
  it('blocks by kind: everything but tasks and paragraphs, grouped by kind in a fixed order, with the status now', () => {
    const g = G([N('req:r', { title: 'R', status: 'shipped' }), N('decision:d', { title: 'D', status: 'proposed' }), N('rule:x', { status: 'proposed' })]);
    const s = S({ artifacts: { docs: [], nodes: [], blocks: [b('rule:x', 'added'), b('decision:d', 'added'), b('req:r', 'changed'), b('task:t', 'added'), b('block:plan.p1', 'added'), b('question:q', 'removed')] } });
    const p = sessionPage(s, g);
    expect(p.kinds.map(k => [k.kind, k.rows.map(r => [r.id, r.change, r.status, r.exists])])).toEqual([
      ['req', [['req:r', 'changed', 'shipped', true]]],
      ['decision', [['decision:d', 'added', 'proposed', true]]],
      ['question', [['question:q', 'removed', '', false]]],
      ['rule', [['rule:x', 'added', 'proposed', true]]],
    ]);
    expect(p.prose).toBe(1);
    expect(p.counts).toEqual({ added: 2, changed: 1, removed: 1 });
  });
  it('opened pages come from the transcript\'s open events, last first, once each', () => {
    const s = S({ transcript: [
      { t: 't1', kind: 'open', text: '/p/v2/d/plan#n-req%3Ar' }, { t: 't2', kind: 'user', text: 'hi' },
      { t: 't3', kind: 'open', text: '/p/v2/d/app-agents' }, { t: 't4', kind: 'open', text: '/p/v2/d/plan#n-req%3Ar' },
    ] });
    expect(sessionPage(s, G([])).opened).toEqual([
      { path: '/p/v2/d/plan#n-req%3Ar', doc: 'plan', node: 'req:r', at: 't4' },
      { path: '/p/v2/d/app-agents', doc: 'app-agents', node: undefined, at: 't3' },
    ]);
  });
  it('nothing recorded → empty lists', () => {
    expect(sessionPage(S(), G([]))).toEqual({ todo: [], todoDone: 0, kinds: [], prose: 0, counts: { added: 0, changed: 0, removed: 0 }, opened: [] });
  });
});
