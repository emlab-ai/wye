import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rebuild } from './write';
import { runVerdicts, verdictLog, verdictsEnabled } from './verdicts';
import { REPO_ROOT } from './products';

// the write-time verdict pass end to end with the fake judge (test/fake-judge.js): pairs → verdicts → lines under the node
const doc = `---
node: module:pay
title: Pay
---

# Pay

\`\`\`yaml
- id: entity:pay.price
  description: a price
- id: decision:pay.net
  title: Prices are stored net CONTRA
  status: approved
  date: 2026-01-01
  affects: [entity:pay.price]
- id: rule:pay.rounding
  statement: Half-up rounding
  source: lib/pay.js:3
  governs: [entity:pay.price]
\`\`\`

decision:pay.gross Prices are stored gross CONTRA LATER #proposed (affects: entity:pay.price, date: 2026-05-01)
`;
let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'wf-verdicts-'));
  await mkdir(path.join(dir, 'projects/p/docs'), { recursive: true });
  await writeFile(path.join(dir, '_product.md'), '---\ntitle: Pay\nverdicts: on\n---\n');
  await writeFile(path.join(dir, 'projects/p/docs/pay.md'), doc);
  process.env.WF_JUDGE_CMD = `node ${path.join(REPO_ROOT, 'test/fake-judge.js')}`;
  const r = await rebuild(dir); if (r.code !== 0) throw new Error(r.output);
});

describe('verdict pass', () => {
  it('is on when _product.md says so', async () => { expect(await verdictsEnabled(dir)).toBe(true); });
  it('judges a new decision against its neighbours and writes the verdict and an open contradiction under it', async () => {
    const r = await runVerdicts(dir, 'pay', ['decision:pay.gross'], { budget: { pairs: 10, calls: 2 } });
    expect(r.judged).toBeGreaterThanOrEqual(2);
    expect(r.verdicts.find(v => v.a === 'decision:pay.net')?.kind).toBe('contradicts');
    expect(r.verdicts.find(v => v.a === 'rule:pay.rounding')?.kind).toBe('consistent');
    expect(r.written).toBe(2);
    const md = await readFile(path.join(dir, 'projects/p/docs/pay.md'), 'utf8');
    expect(md).toMatch(/decision:pay\.gross Prices are stored gross[^\n]*\n\n {2}verdict:[0-9a-f]{12} contradicts decision:pay\.net — /);
    expect(md).toMatch(/\n {2}contradiction:pay\.[0-9a-f]{12} decision:pay\.gross contradicts decision:pay\.net — .* #open/);
    expect(md).not.toMatch(/verdict:[0-9a-f]{12} consistent/);
    const log = await verdictLog(dir);
    expect(log.filter(v => v.b === 'decision:pay.gross').length).toBe(r.judged);
  });
  it('writes nothing the second time: verdicts are cached and lines already there', async () => {
    await rebuild(dir);
    const r = await runVerdicts(dir, 'pay', ['decision:pay.gross']);
    expect(r.verdicts.every(v => v.cached)).toBe(true);
    expect(r.written).toBe(0);
  });
  it('the written lines are nodes: an open contradiction between the two, content of the decision', async () => {
    const g = JSON.parse(await readFile(path.join(dir, '_build/graph.json'), 'utf8')) as { nodes: { id: string; kind: string; status: string }[]; edges: { from: string; to: string; verb: string }[] };
    const c = g.nodes.find(n => n.kind === 'contradiction'); expect(c?.status).toBe('open');
    expect(g.edges.some(e => e.from === 'decision:pay.gross' && e.verb === 'has' && e.to === c!.id)).toBe(true);
    expect(g.edges.filter(e => e.from === c!.id && e.verb === 'between').map(e => e.to).sort()).toEqual(['decision:pay.gross', 'decision:pay.net']);
  });
});
