import { describe, it, expect } from 'vitest';
import { cardValue, parseAction, parseHook, eventsFromDiff, matchHooks, fillTemplate, templateVars, nextDepth, whereMatches } from './hooks';
import type { GraphData, GraphNode } from './graph';

// hooks (decision:wf2.hooks-and-skills): a card is when.kind + where + do; events come from the rebuild diff; once per node
const node = (id: string, o: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: o.title ?? id, status: o.status ?? '', section: '', subsection: '', file: o.file ?? 'data/products/p/projects/x/docs/requirements-a.md', line: 1, body: o.body ?? '', defined: true, ...o });
const graph = (nodes: GraphNode[], edges: GraphData['edges'] = []): GraphData => ({ generatedAt: '', modules: [], files: [], nodes, edges, fieldIndex: {} });
const hookNode = (body: string, status = 'active') => node('hook:h', { body: `id: hook:h\ntitle: H\n${body}`, status });

describe('hook cards', () => {
  it('reads one-line, block and list values', () => {
    expect(cardValue('on: req.status:approved\ndo: run skill:x', 'do')).toBe('run skill:x');
    expect(cardValue('do: |\n  run skill:x\n  add tests\nonce: true', 'do')).toBe('run skill:x\nadd tests');
    expect(cardValue('do:\n  - run skill:x\n  - add tests\nonce: true', 'do')).toBe('run skill:x\nadd tests');
    expect(cardValue('body: |\n  - test:{{slug}}\n    title: t\n', 'body')).toBe('- test:{{slug}}\n  title: t');
    expect(cardValue('on: x', 'missing')).toBe('');
  });
  it('parses actions', () => {
    expect(parseAction('run skill:define-tests')).toEqual({ kind: 'run', skill: 'skill:define-tests' });
    expect(parseAction('run define-tests')).toEqual({ kind: 'run', skill: 'skill:define-tests' });
    expect(parseAction('add test-card')).toEqual({ kind: 'add', template: 'test-card' });
    expect(parseAction('add template:test-card to tests')).toEqual({ kind: 'add', template: 'test-card', to: 'tests' });
    expect(parseAction('assign task:a --worker claude-code')).toEqual({ kind: 'assign', task: 'task:a', worker: 'claude-code' });
    expect(parseAction('assign task:a --skill define-tests')).toEqual({ kind: 'assign', task: 'task:a', skill: 'skill:define-tests' });
    expect(parseAction('task "Define test cases for {{title}}" --worker agent --skill skill:define-tests')).toEqual({ kind: 'task', text: 'Define test cases for {{title}}', worker: 'agent', skill: 'skill:define-tests' });
    expect(parseAction('task "Review {{title}}"')).toEqual({ kind: 'task', text: 'Review {{title}}' });
    expect(parseAction('run workflow:feature')).toEqual({ kind: 'workflow', workflow: 'workflow:feature' });
    expect(parseAction('dispatch plan')).toEqual({ kind: 'dispatch', doc: 'plan' });
    expect(parseAction('dispatch plan --workers 3')).toEqual({ kind: 'dispatch', doc: 'plan', workers: 3 });
    expect(parseAction('notify "done"')).toEqual({ kind: 'notify', text: 'done' });
    expect(parseAction('dance')).toBeNull();
  });
  it('parses a hook: on, where, several do lines, once default true, paused status', () => {
    const h = parseHook(hookNode('on: req.status:approved\nwhere: document=requirements-* type=req\ndo:\n  - run skill:define-tests\n  - add test-card\nskills: [skill:a]'))!;
    expect(h.on).toEqual({ kind: 'req', event: 'status:approved' });
    expect(h.where).toEqual({ document: 'requirements-*', type: 'req' });
    expect(h.actions).toHaveLength(2); expect(h.once).toBe(true); expect(h.status).toBe('active'); expect(h.skills).toEqual(['skill:a']);
    expect(parseHook(hookNode('on: req.created\ndo: run x\nonce: false'))!.once).toBe(false);
    expect(parseHook(hookNode('on: nonsense\ndo: run x'))).toBeNull();
    expect(parseHook(node('req:x'))).toBeNull();
  });
  it('fills a hyphenated binding name — {{dev-design}} is how a stage names the document it produced', () => {
    expect(fillTemplate('in {{dev-design}}', { 'dev-design': 'module:x-dev-design' })).toBe('in module:x-dev-design');
  });
});

describe('events from a diff', () => {
  const before = graph([node('req:a', { status: 'proposed' }), node('req:b', { status: 'proposed' })], []);
  const after = graph([node('req:a', { status: 'approved' }), node('req:b', { status: 'proposed' }), node('req:c', { status: 'proposed' }), node('block:1', { form: 'block' }), node('hook:h', { status: 'active' })], [{ from: 'test:t', to: 'req:b', verb: 'verifies' }, { from: 'block:9', to: 'req:b', verb: 'mentions' }]);
  const changes = [{ id: 'req:a', change: 'changed' as const, doc: '', title: '', at: '' }, { id: 'req:c', change: 'added' as const, doc: '', title: '', at: '' }, { id: 'block:1', change: 'added' as const, doc: '', title: '', at: '' }, { id: 'hook:h', change: 'added' as const, doc: '', title: '', at: '' }];
  it('names created, status moves and new links on the target; never blocks or hooks', () => {
    const ev = eventsFromDiff(before, after, changes);
    expect(ev).toContainEqual({ kind: 'req', id: 'req:a', event: 'status:approved' });
    expect(ev).toContainEqual({ kind: 'req', id: 'req:c', event: 'created' });
    expect(ev).toContainEqual({ kind: 'req', id: 'req:c', event: 'status:proposed' });
    expect(ev).toContainEqual({ kind: 'req', id: 'req:b', event: 'linked:verifies', verb: 'verifies' });
    expect(ev.some(e => e.id === 'block:1' || e.id === 'hook:h' || e.verb === 'mentions')).toBe(false);
    expect(ev.some(e => e.id === 'req:b' && e.event.startsWith('status'))).toBe(false);
  });
});

describe('matching', () => {
  const req = node('req:a', { status: 'approved', body: 'id: req:a\npriority: high' });
  const ev = { kind: 'req', id: 'req:a', event: 'status:approved' };
  const hook = (body: string, status = 'active') => parseHook(hookNode(body, status))!;
  it('kind or *, the event, where filters, once and paused', () => {
    expect(matchHooks([hook('on: req.status:approved\ndo: run x')], ev, req, new Set())).toHaveLength(1);
    expect(matchHooks([hook('on: *.status:approved\ndo: run x')], ev, req, new Set())).toHaveLength(1);
    expect(matchHooks([hook('on: decision.status:approved\ndo: run x')], ev, req, new Set())).toHaveLength(0);
    expect(matchHooks([hook('on: req.created\ndo: run x')], ev, req, new Set())).toHaveLength(0);
    expect(matchHooks([hook('on: req.status:approved\nwhere: document=requirements-*\ndo: run x')], ev, req, new Set())).toHaveLength(1);
    expect(matchHooks([hook('on: req.status:approved\nwhere: document=plan*\ndo: run x')], ev, req, new Set())).toHaveLength(0);
    expect(matchHooks([hook('on: req.status:approved\nwhere: prop=priority:high\ndo: run x')], ev, req, new Set())).toHaveLength(1);
    expect(matchHooks([hook('on: req.status:approved\nwhere: prop=priority:low\ndo: run x')], ev, req, new Set())).toHaveLength(0);
    expect(matchHooks([hook('on: req.status:approved\ndo: run x', 'paused')], ev, req, new Set())).toHaveLength(0);
    expect(matchHooks([hook('on: req.status:approved\ndo: run x')], ev, req, new Set(['hook:h|req:a']))).toHaveLength(0);
    expect(matchHooks([hook('on: req.status:approved\ndo: run x\nonce: false')], ev, req, new Set(['hook:h|req:a']))).toHaveLength(1);
    expect(matchHooks([hook('on: req.status:approved\ndo: dance')], ev, req, new Set())).toHaveLength(0);
  });
  it('a session event filters by role without a node', () => {
    expect(whereMatches({ role: 'worker' }, undefined, { kind: 'session', id: 'session:1', event: 'done', role: 'worker' })).toBe(true);
    expect(whereMatches({ role: 'librarian' }, undefined, { kind: 'session', id: 'session:1', event: 'done', role: 'worker' })).toBe(false);
  });
});

describe('templates and depth', () => {
  it('fills the node vars and leaves unknown names', () => {
    expect(fillTemplate('- test:{{slug}}-t\n  covers: [{{node}}] {{title}} {{kind}} {{other}}', templateVars(node('req:a.b', { title: 'A b' })))).toBe('- test:a.b-t\n  covers: [req:a.b] A b req {{other}}');
  });
  it('depth grows by one per hook-made change and stops at 3', () => {
    expect(nextDepth(undefined)).toBe(0); expect(nextDepth(0)).toBe(1); expect(nextDepth(2)).toBe(3); expect(nextDepth(3)).toBeNull();
  });
});
