import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { transcriptExcerpt, parseCandidates, candidateSlug, candidateCard, insertIntoPlanSection, consolidateSession, consolidateEnabled } from './consolidate';
import { rebuild } from './write';
import { REPO_ROOT } from './products';
import type { ChatEvent, Session } from './session-types';
import type { JevClient } from './jev';

// consolidation at session end (decision:memory.consolidate-sessions): the transcript → candidates → proposed cards with evidence
const ev = (kind: ChatEvent['kind'], text: string): ChatEvent => ({ t: '2026-09-19T10:00:00Z', kind, text });

describe('consolidation, pure parts', () => {
  it('excerpts the words of the person and the agent with their event numbers, not the tools', () => {
    const x = transcriptExcerpt([ev('user', 'Build it'), ev('tool_use', 'ls'), ev('thinking', 'hm'), ev('assistant', 'Done.')]);
    expect(x).toBe('#0 PERSON: Build it\n#3 AGENT: Done.');
  });
  it('cuts the middle of a long conversation', () => {
    const x = transcriptExcerpt(Array.from({ length: 200 }, (_, i) => ev('user', `message ${i} ` + 'x'.repeat(500))), 20000);
    expect(x.length).toBeLessThan(21000); expect(x).toContain('left out');
  });
  it('parses candidates leniently', () => {
    const cs = parseCandidates('Here: [{"kind":"decision","title":"Prices are gross","text":"we store gross","by":"person","evidence":[3,"7"]},{"kind":"nonsense","title":"x"}]');
    expect(cs).toHaveLength(1); expect(cs[0].evidence).toEqual([3, 7]);
  });
  it('makes an id from the title, unique against the graph', () => {
    const c = { kind: 'decision' as const, title: 'The prices are stored gross, always', text: '', by: 'person' as const, evidence: [] };
    const taken = new Set(['decision:shop.prices-stored-gross']);
    expect(candidateSlug('shop', c, taken)).toBe('decision:shop.prices-stored-gross-2');
  });
  it('writes a card with by, evidence and part-of, a question open', () => {
    const card = candidateCard('question:shop.rounding', { kind: 'question', title: 'Which rounding?', text: 'Half-up or bankers?', by: 'agent', evidence: [4, 9] }, { id: 'abc123' }, 'pr:pr-x', 'claude-code', '2026-09-19');
    expect(card).toContain('- id: question:shop.rounding'); expect(card).toContain('status: open'); expect(card).toContain('by: agent:claude-code'); expect(card).toContain('evidence: [session:abc123#4, session:abc123#9]'); expect(card).toContain('part-of: pr:pr-x');
  });
  it('carries related-to on a card when links are given', () => {
    const card = candidateCard('decision:shop.round', { kind: 'decision', title: 'Round half-up', text: 'because the accountant', by: 'person', evidence: [1] }, { id: 'abc' }, 'pr:p', 'claude-code', '2026-09-20', ['rule:round', 'req:pay']);
    expect(card).toContain('  related-to: [rule:round, req:pay]');
    expect(candidateCard('decision:shop.round', { kind: 'decision', title: 'X', text: 'y', by: 'person', evidence: [] }, { id: 'abc' }, 'pr:p', 'claude-code', '2026-09-20')).not.toContain('related-to');
  });
  it('puts the cards at the end of the Plan section, before Tasks', () => {
    const md = '# P\n\n## Plan\n\n_what_\n\n## Tasks\n\n- [ ] task:x.y do';
    const out = insertIntoPlanSection(md, ['- id: decision:x.a\n  title: A']);
    expect(out.indexOf('```yaml')).toBeGreaterThan(out.indexOf('## Plan')); expect(out.indexOf('```yaml')).toBeLessThan(out.indexOf('## Tasks'));
    expect(out).toContain('_what_\n\n```yaml\n- id: decision:x.a\n  title: A\n```\n\n## Tasks');
  });
});

describe('consolidation, end to end with a fake model', () => {
  let dir = ''; const plan = `---
node: pr:pr-gross
type: pr
title: gross prices
status: done
session: s1
---

# gross prices

## Request

> make prices gross

## Plan

_What was understood._

## Tasks

- [x] task:shop.gross Store prices gross part of pr:pr-gross

## Result
`;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'wf-consolidate-'));
    await mkdir(path.join(dir, 'projects/p/docs'), { recursive: true });
    await writeFile(path.join(dir, '_product.md'), '---\ntitle: Shop\nconsolidate: on\n---\n');
    await writeFile(path.join(dir, 'projects/p/docs/prs.md'), '---\nnode: module:p-prs\ntitle: PRs\n---\n\n# PRs\n');
    await writeFile(path.join(dir, 'projects/p/docs/pr-gross.md'), plan);
    process.env.WF_JUDGE_CMD = `node ${path.join(REPO_ROOT, 'test/fake-consolidator.js')}`;
    const r = await rebuild(dir); if (r.code !== 0) throw new Error(r.output);
  });
  it('is on when _product.md says so', async () => { expect(await consolidateEnabled(dir)).toBe(true); });
  it('files what the conversation decided but nobody wrote, with evidence, and skips what was written', async () => {
    const s = {
      id: 's1', product: path.basename(dir), agent: 'claude-code', status: 'done', prDoc: `${path.basename(dir)}/p/pr-gross`, refs: [], instruction: 'make prices gross', source: {}, log: [], createdAt: '', updatedAt: '',
      transcript: [ev('user', 'Make prices gross. ' + 'x'.repeat(200)), ev('assistant', 'Doing it. [[decision: Prices are stored gross]]'), ev('user', 'And [[constraint: Never round before the total]] — [[question: Which rounding do we use]]'), ev('assistant', 'Noted. [[lesson: The price test broke because the fixture was net]]')],
      artifacts: { docs: [], nodes: [], blocks: [{ id: 'decision:shop.prices-gross', change: 'added', doc: 'pr:pr-gross', title: 'Prices are stored gross', at: '' }] },
    } as unknown as Session;
    // with a Jev client every card is linked before it is written (Jev auto-linking design §4): the stubbed judge is sure of task:shop.gross
    const jev: JevClient = { enabled: true, model: 'fake', ask: async () => ({ model: '', answers: {}, usage: {} }), judgeLinks: async (_t, c) => c.map(x => ({ id: x.id, p: x.id === 'task:shop.gross' ? 0.9 : 0.1 })), judgeKind: async () => ({ kind: 'note', p: 0 }) };
    const searchFn = async () => Object.assign([{ id: 'task:shop.gross', score: 0.5, semantic: 0.5, keyword: 0, snippet: '' }, { id: 'pr:pr-gross', score: 0.4, semantic: 0.4, keyword: 0, snippet: '' }], { hidden: 0 });
    const r = await consolidateSession(dir, path.basename(dir), s, { jev, searchFn: searchFn as never });
    expect(r.candidates.map(c => c.kind).sort()).toEqual(['constraint', 'lesson', 'question']);
    expect(r.filed).toHaveLength(3);
    const md = await readFile(path.join(dir, 'projects/p/docs/pr-gross.md'), 'utf8');
    expect(md).toMatch(/## Plan\n\n_What was understood._\n\n```yaml\n- id: constraint:[^\n]+\n  title: Never round before the total/);
    expect(md).toContain('evidence: [session:s1#2]'); expect(md).toContain('by: person'); expect(md).toContain('by: agent:claude-code');
    expect(md).toMatch(/- id: question:[^\n]+\n  title: Which rounding do we use\n  q: >/); expect(md).toContain('status: open');
    expect(md).toMatch(/- id: lesson:/);
    expect(md.match(/related-to: \[task:shop.gross\]/g)).toHaveLength(3);
    expect(md.indexOf('```yaml')).toBeLessThan(md.indexOf('## Tasks'));
    await rebuild(dir);
    const g = JSON.parse(await readFile(path.join(dir, '_build/graph.json'), 'utf8')) as { nodes: { id: string; kind: string; status: string; defined: boolean }[] };
    expect(g.nodes.filter(n => n.defined && ['constraint', 'lesson', 'question'].includes(n.kind)).length).toBe(3);
    expect(g.nodes.find(n => n.kind === 'lesson')?.status).toBe('proposed');
  });
});
