import { describe, it, expect } from 'vitest';
import { nodeValue, changedKeys, isTrackingOnly, recordsFromDiff, revertPatch, changedSince, type ChangeRecord } from './changes';
import { wordDiff } from './diff';
import type { GraphData, GraphNode } from './graph';

const F = 'data/products/p/projects/v2/docs/prd.md';
const node = (id: string, kind: string, body: string, status: string, form: 'prose' | 'yaml' | 'block' = 'yaml', extra: Partial<GraphNode> = {}): GraphNode => ({ id, kind, title: body.match(/^title: (.*)$/m)?.[1] ?? id, status, section: '', subsection: '', body, defined: true, file: F, line: 10, form, ...extra });
const graph = (nodes: GraphNode[]): GraphData => ({ generatedAt: '', files: [], fieldIndex: {}, modules: [{ id: 'module:prd', title: 'PRD', file: F, verified: '', sourceRoots: [] }], nodes, edges: [] });

describe('change records (decision:exec.change-record, decision:exec.changes-from-the-rebuild-diff)', () => {
  const before = graph([
    node('req:x.a', 'req', 'id: req:x.a\ntitle: The old title\nwhen: a click\nthen: it opens\nrefines: req:x.root', 'approved'),
    node('task:x.t', 'task', 'id: task:x.t\ntext: Do it', 'open', 'prose'),
    node('decision:x.d', 'decision', 'id: decision:x.d\ntitle: D\nchoice: keep', 'proposed'),
    node('block:prd.abc', 'block', 'text: a paragraph', '', 'block'),
  ]);
  const after = graph([
    node('req:x.a', 'req', 'id: req:x.a\ntitle: The new title\nwhen: a click\nthen: it opens at once\nrefines: req:x.root\nowner: alex', 'approved'),
    node('task:x.t', 'task', 'id: task:x.t\ntext: Do it\nworker: bo\nsession: s1', 'in-progress', 'prose'),
    node('decision:x.d', 'decision', 'id: decision:x.d\ntitle: D\nchoice: drop', 'proposed'),
    node('block:prd.def', 'block', 'text: a changed paragraph', '', 'block'),
  ]);
  const changes = [
    { id: 'req:x.a', change: 'changed' as const, doc: 'module:prd', title: 'The new title', at: 't' },
    { id: 'task:x.t', change: 'changed' as const, doc: 'module:prd', title: 'Do it', at: 't' },
    { id: 'decision:x.d', change: 'changed' as const, doc: 'module:prd', title: 'D', at: 't' },
    { id: 'block:prd.abc', change: 'removed' as const, doc: 'module:prd', title: '', at: 't' }, { id: 'block:prd.def', change: 'added' as const, doc: 'module:prd', title: '', at: 't' },
  ];
  it('keeps text, status and properties apart and names what changed', () => {
    const a = nodeValue(before.nodes[0]), b = nodeValue(after.nodes[0]);
    expect(a).toMatchObject({ text: 'The old title', textKey: 'title', status: 'approved', props: { when: 'a click', then: 'it opens', refines: 'req:x.root' } });
    expect(changedKeys(a, b)).toEqual(['text', 'then', 'owner']);
    expect(isTrackingOnly(['status', 'worker', 'session'])).toBe(true);
    expect(isTrackingOnly(['status', 'then'])).toBe(false);
  });
  it('makes one record per changed typed node: pending for an agent or an approved node, accepted for tracking-only and a person\'s own proposed block, none for paragraphs', () => {
    const recs = recordsFromDiff(before, after, changes, id => id === 'req:x.a' ? { by: 'agent:s9', session: 's9' } : { by: 'person' }, '2026-09-19T10:00:00Z', 'p');
    expect(recs.map(r => [r.node, r.state, r.tracking ?? false, r.own ?? false])).toEqual([['req:x.a', 'pending', false, false], ['task:x.t', 'accepted', true, false], ['decision:x.d', 'accepted', false, true]]);
    expect(recs[0]).toMatchObject({ kind: 'req', doc: 'module:prd', by: 'agent:s9', session: 's9', changed: ['text', 'then', 'owner'] });
    expect(recs[0].before.text).toBe('The old title'); expect(recs[0].after.props.then).toBe('it opens at once');
  });
  it('revert puts the old value back through the writer: text (a title as a property), status, and removes what only the new value had', () => {
    const r = recordsFromDiff(before, after, changes, () => ({ by: 'agent:s9', session: 's9' }), 't', 'p')[0] as ChangeRecord;
    expect(revertPatch(r)).toEqual({ props: { then: 'it opens', owner: null, title: 'The old title' } });
    const t = recordsFromDiff(before, after, changes, () => ({ by: 'agent:s9', session: 's9' }), 't', 'p')[1] as ChangeRecord;
    expect(revertPatch(t)).toEqual({ status: 'open', props: { worker: null, session: null } });
    expect(changedSince(r, after.nodes[0])).toBe(false);
    expect(changedSince(r, node('req:x.a', 'req', 'id: req:x.a\ntitle: Moved on', 'approved'))).toBe(true);
    expect(changedSince(r, undefined)).toBe(true);
  });
  it('word diff marks removed and added words', () => {
    expect(wordDiff('it opens', 'it opens at once')).toEqual([{ kind: 'same', text: 'it opens' }, { kind: 'add', text: ' at once' }]);
    expect(wordDiff('the old title', 'the new title').map(r => r.kind)).toEqual(['same', 'del', 'add', 'same']);
  });
});
