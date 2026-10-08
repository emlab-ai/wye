import { describe, it, expect } from 'vitest';
import { nodeValue, changedKeys, isTrackingOnly, recordsFromDiff, revertPatch, changedSince, recordChanges, listChanges, type ChangeRecord, removalRecord } from './changes';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
  it('makes one record per changed typed node: pending for an agent or an approved node, accepted for tracking-only, none for a block nobody approved yet or for paragraphs', () => {
    const recs = recordsFromDiff(before, after, changes, id => id === 'req:x.a' ? { by: 'agent:s9', session: 's9' } : { by: 'person' }, '2026-09-19T10:00:00Z', 'p');
    // decision:x.d is still proposed: an edit to it refines the proposal the Inbox shows, and leaves no record of its own
    expect(recs.map(r => [r.node, r.state, r.tracking ?? false, r.own ?? false])).toEqual([['req:x.a', 'pending', false, false], ['task:x.t', 'accepted', true, false]]);
    expect(recs[0]).toMatchObject({ kind: 'req', doc: 'module:prd', by: 'agent:s9', session: 's9', changed: ['text', 'then', 'owner'] });
    expect(recs[0].before.text).toBe('The old title'); expect(recs[0].after.props.then).toBe('it opens at once');
  });
  it('one pending record per node: a later edit by anyone folds in, keeps the first before, names every writer; back to the start closes it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-changes-'));
    const later = graph([node('req:x.a', 'req', 'id: req:x.a\ntitle: The newest title\nwhen: a click\nthen: it opens at once\nrefines: req:x.root\nowner: alex', 'approved')]);
    const first = await recordChanges(dir, 'p', before, after, changes.slice(0, 1), () => ({ by: 'person' }));
    expect(first.map(r => r.state)).toEqual(['pending']);
    const second = await recordChanges(dir, 'p', after, later, changes.slice(0, 1), () => ({ by: 'agent:s9', session: 's9' }));
    expect(second).toHaveLength(1); expect(second[0].id).toBe(first[0].id);
    expect(second[0]).toMatchObject({ by: 'person', also: ['agent:s9'], session: 's9' });
    expect(second[0].before.text).toBe('The old title'); expect(second[0].after.text).toBe('The newest title');
    expect((await listChanges(dir, { state: 'pending' })).length).toBe(1);
    const back = await recordChanges(dir, 'p', later, before, changes.slice(0, 1), () => ({ by: 'person' }));
    expect(back).toHaveLength(0); // nothing left to review
    expect((await listChanges(dir, { state: 'pending' })).length).toBe(0);
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

describe('removalRecord', () => {
  it('keeps the removed text and the node as it was, accepted (the person\'s own act), so it can be read back', () => {
    const n = { id: 'req:a', kind: 'req', title: 'A', status: 'proposed', body: 'id: req:a\ntitle: A\nstatus: proposed', file: 'p/docs/m.md', line: 4 } as never;
    const r = removalRecord(n, '- id: req:a\n  title: A', 'person', 'p', '2026-10-03T00:00:00Z', 'module:m');
    expect(r).toMatchObject({ node: 'req:a', kind: 'req', doc: 'module:m', changed: ['removed'], state: 'accepted', by: 'person', removed: { text: '- id: req:a\n  title: A' } });
    expect(r.before.title).toBe('A'); expect(r.after.body).toBe('');
  });
});

import { putBack } from './changes';
describe('putBack', () => {
  it('puts the removed text back at its line, as a paragraph of its own', () => {
    const md = '# P\n\nfirst\n\n```yaml\n- id: req:b\n  title: B\n```\n';
    const text = '```yaml\n- id: req:a\n  title: A\n```';
    expect(putBack(md, text, 4)).toBe('# P\n\nfirst\n\n```yaml\n- id: req:a\n  title: A\n```\n\n```yaml\n- id: req:b\n  title: B\n```\n');
    expect(putBack('# P\n', text, 99)).toBe('# P\n\n```yaml\n- id: req:a\n  title: A\n```');
  });
});
