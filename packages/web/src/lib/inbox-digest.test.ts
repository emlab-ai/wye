import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addInboxItem, digestInboxItem, listInboxItems } from './inbox';

// a raw request stored in the inbox and digested at once (decision:waterfall.raw-request-to-inbox-then-digest): a
// Remember session starts on the item's words, the item names the session, and a session that fails to start leaves
// the item as it was — stored, waiting
describe('inbox digest', () => {
  it('starts a Remember session on the item and records it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-digest-'));
    const name = await addInboxItem(dir, { title: 'No hooks', text: 'Alex: the agent must know the rules without hooks.', from: 'claude-code', refs: ['decision:x'] });
    const seen: { instruction: string; refs: string[]; source: Record<string, string> }[] = [];
    const r = await digestInboxItem(dir, name, async o => { seen.push(o); return { id: 'sess-1' }; });
    expect(r).toEqual({ session: 'sess-1' });
    expect(seen).toHaveLength(1);
    expect(seen[0].instruction).toBe('No hooks\n\nAlex: the agent must know the rules without hooks.');
    expect(seen[0].refs).toEqual(['decision:x']);
    expect(seen[0].source).toEqual({ inbox: name, from: 'claude-code' });
    expect(await readFile(path.join(dir, 'inbox', name), 'utf8')).toMatch(/^session: sess-1$/m);
    expect((await listInboxItems(dir)).find(i => i.name === name)!.session).toBe('sess-1');
  });
  it('leaves the item stored when the session cannot start', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-digest-'));
    const name = await addInboxItem(dir, { text: 'a note' });
    const r = await digestInboxItem(dir, name, async () => { throw new Error('no agent'); });
    expect(r).toEqual({ session: null, error: 'no agent' });
    expect(await readFile(path.join(dir, 'inbox', name), 'utf8')).not.toMatch(/^session:/m);
  });
});

import { impactInboxItem, linkInboxItem } from './inbox';
import type { GraphData, GraphNode } from './graph';
import type { JevClient } from './jev';

// raw input (decision:waterfall.raw-input-stays-raw): an item from `wye remember` keeps `type: note` whatever Jev is
// sure of — it is the person's words, not a block — and its impact on what is known is judged on arrival and kept
// beside it, never written into the documents
const node = (id: string, body: string): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: 'approved', section: '', subsection: '', file: 'x/docs/d.md', line: 1, body, defined: true });
const g: GraphData = { generatedAt: '', modules: [], files: [], nodes: [node('decision:hooks', 'text: agents connect through per-session hooks'), node('req:login', 'title: Login')], edges: [], fieldIndex: {} };
const searchFn = async () => Object.assign([{ id: 'decision:hooks', score: 0.8, semantic: 0.8, keyword: 0, snippet: '' }, { id: 'req:login', score: 0.2, semantic: 0.2, keyword: 0, snippet: '' }], { hidden: 0 });
const jev: JevClient = { enabled: true, model: 'fake', ask: async () => ({ model: '', answers: {}, usage: {} }), judgeLinks: async (_t, c) => c.map(x => ({ id: x.id, p: 0.95 })), judgeKind: async () => ({ kind: 'requirement', p: 0.99 }) };

describe('raw input', () => {
  it('is linked but never retyped', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-raw-'));
    const name = await addInboxItem(dir, { text: 'no hooks, it must be done once', from: 'agent', raw: true });
    expect(await readFile(path.join(dir, 'inbox', name), 'utf8')).toMatch(/^raw: true$/m);
    const r = await linkInboxItem(dir, g, name, jev, searchFn as never);
    expect(r.type).toBeUndefined();
    const item = (await listInboxItems(dir)).find(i => i.name === name)!;
    expect(item.raw).toBe(true); expect(item.type).toBe('note'); expect(item.refs).toContain('decision:hooks');
  });
  it('keeps the impact judged on arrival beside the item', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-raw-'));
    const name = await addInboxItem(dir, { text: 'no hooks, it must be done once', raw: true });
    const seen: { before: string; after: string }[] = [];
    const r = await impactInboxItem(dir, g, name, { searchFn: searchFn as never, judge: async (change, cands) => { seen.push(change); return cands.map(c => c.id === 'decision:hooks' ? { verdict: 'contradicts', reason: 'the input rules hooks out', question: null } : { verdict: 'unaffected', reason: '', question: null }); } });
    expect(seen[0].after).toContain('no hooks'); expect(seen[0].before).toMatch(/nothing/);
    expect(r.candidates.map(c => [c.id, c.verdict])).toEqual([['decision:hooks', 'contradicts']]); // the unaffected one is not kept
    const item = (await listInboxItems(dir)).find(i => i.name === name)!;
    expect(item.impact?.candidates[0]).toMatchObject({ id: 'decision:hooks', verdict: 'contradicts', reason: 'the input rules hooks out' });
    expect((await listInboxItems(dir)).map(i => i.name)).toEqual([name]); // the sidecar is not an item
  });
});
