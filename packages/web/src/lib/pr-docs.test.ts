import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { approvePr, cancelPr, reopenPr, readPrDoc, prReadiness, createPrDoc } from './pr-docs';
import type { Session } from './session-types';
import { rebuild } from './write'; import { DATA_ROOT } from './products'; import { loadScope } from './scope';

// approval (decision:wf2.pr-approval-is-the-persons-click): the person's click sets approved with who and when;
// cancel and reopen move it back; readiness names what is unagreed
describe('pr approval', () => {
  let dir: string; let product: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(DATA_ROOT, 'products', 'zz-pr-')); product = path.basename(dir);
    await mkdir(path.join(dir, 'projects/p/docs'), { recursive: true });
    await writeFile(path.join(dir, '_product.md'), '---\ntitle: T\n---\n');
    await writeFile(path.join(dir, 'projects/p/docs/prs.md'), '---\nnode: module:p-prs\ntype: module\ntitle: PRs\n---\n\n# PRs\n');
    await writeFile(path.join(dir, 'projects/p/docs/pr-a.md'), '---\nnode: pr:pr-a\ntype: pr\ntitle: A\nstatus: draft\nsession: s9\npart-of: module:p-prs\n---\n\n# A\n\n## Definition\n\n```yaml\n- id: req:t.a\n  title: A\n  status: proposed\n```\n\n## Tasks\n\n- [ ] task:pr-a A #in-progress\n');
    const r = await rebuild(dir); if (r.code !== 0) throw new Error(r.output);
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
  it('approves with who and when, even when not ready; reopen and cancel', async () => {
    const scope = (await loadScope(product))!; const pr = (await readPrDoc(product, `${product}/p/pr-a`))!;
    const r = prReadiness(scope, pr.md); expect(r.ok).toBe(false); expect(r.unagreed).toEqual(['req:t.a']); expect(r.tasks).toBe(true); expect(r.definition).toBe(true);
    await approvePr(dir, product, `${product}/p/pr-a`, 'alex');
    const md = await readFile(path.join(dir, 'projects/p/docs/pr-a.md'), 'utf8');
    expect(md).toMatch(/^status: approved$/m); expect(md).toMatch(/^approved-by: alex$/m); expect(md).toMatch(/^approved-at: \d{4}-/m);
    await reopenPr(dir, product, `${product}/p/pr-a`);
    const back = await readFile(path.join(dir, 'projects/p/docs/pr-a.md'), 'utf8');
    expect(back).toMatch(/^status: draft$/m); expect(back).not.toMatch(/approved-by/); expect(back).toMatch(/task:pr-a A #todo/);
    await cancelPr(dir, product, `${product}/p/pr-a`);
    const gone = await readFile(path.join(dir, 'projects/p/docs/pr-a.md'), 'utf8');
    expect(gone).toMatch(/^status: cancelled$/m); expect(gone).toMatch(/^finished: /m);
  });
  it('a PR is born refining under a librarian and building under a worker (decision:wf2.pr-lifecycle)', async () => {
    const base = { id: 'l1', product, agent: 'claude-code', status: 'running', refs: [], source: {}, instruction: 'make the checkout round half-up', log: [], createdAt: '', updatedAt: '' } as unknown as Session;
    const ref = await createPrDoc(dir, product, { ...base, role: 'librarian' });
    expect(ref).toBe(`${product}/p/pr-1`); // pr-a is not numbered, so #1
    const md = await readFile(path.join(dir, 'projects/p/docs/pr-1.md'), 'utf8');
    expect(md).toMatch(/^node: pr:1$/m); expect(md).toMatch(/^type: pr$/m); expect(md).toMatch(/^status: refining$/m); expect(md).toMatch(/^part-of: module:p-prs$/m); expect(md).toContain('## Impact');
    const ref2 = await createPrDoc(dir, product, { ...base, id: 'w1', instruction: 'make the checkout round half-up' });
    expect(ref2).toBe(`${product}/p/pr-2`);
    expect(await readFile(path.join(dir, 'projects/p/docs/pr-2.md'), 'utf8')).toMatch(/^status: building$/m);
  });
});
