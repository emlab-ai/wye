import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nextPrNumber, prNumberOf, prLabel, prTitle, prDocBody, fromLine, resultSection, withResult, setFrontmatter, getFrontmatter, prsOf, prStatusOnEnd, requestTaskStatusOnEnd, definitionIds, withDefinition, definitionState, readiness, taskLines } from './pr-doc';

const TPL = readFileSync(path.join(__dirname, '../../../../templates/docs/pr.md'), 'utf8');
const vars = { num: 41, slug: 'pr-41', title: 'page link on the session', date: '2026-09-18', session: 'abc123', agent: 'claude-code', parent: 'module:app-agents', started: '2026-09-18T12:00:00.000Z', request: 'page link on the session, it looks good\n\n## but\nshould be a plan', from: '_from: module:app-agents · refs: req:x_' };

describe('prNumber / prTitle', () => {
  it('numbers like pull requests: one more than the highest in use, from ids or slugs', () => {
    expect(nextPrNumber([])).toBe(1);
    expect(nextPrNumber(['pr:3', 'pr-7', 'pr:pr-old-words', 'req:x'])).toBe(8);
    expect(prNumberOf('pr:12')).toBe(12); expect(prNumberOf('pr-12')).toBe(12); expect(prNumberOf('pr-words')).toBeNull();
    expect(prLabel(12, 'Round half-up')).toBe('#12 Round half-up');
  });
  it('titles from the first line, markdown stripped and cut', () => {
    expect(prTitle('\n# **Fix** the [thing](http://x)\nmore')).toBe('Fix the thing');
    expect(prTitle('w '.repeat(80))).toMatch(/…$/);
  });
});

describe('prDocBody', () => {
  it('fills the template: typed frontmatter, the request quoted, the from line, the sections', () => {
    const md = prDocBody(TPL, vars);
    expect(md).toMatch(/^---\nnode: pr:41\ntype: pr\ntitle: page link on the session\n/);
    expect(md).toContain('session: abc123\nagent: claude-code\nstarted: 2026-09-18T12:00:00.000Z\npart-of: module:app-agents\n---');
    expect(md).toContain('## Request\n\n> page link on the session, it looks good\n> \n> ## but\n> should be a plan\n\n_from: module:app-agents · refs: req:x_\n\n## Context');
    for (const h of ['## Context', '## Definition', '## Impact', '## Tasks', '## Result']) expect(md).toContain(h);
    expect(md).toContain('part of pr:41');
  });
  it('writes the request as a task line under Tasks with the worker and the session (req:exec.request-is-a-task)', () => {
    const md = prDocBody(TPL, { ...vars, title: 'Fix (the) #thing', partOf: 'goal:g1' });
    expect(md).toContain('- [ ] task:pr-41 Fix the thing #in-progress (worker: claude-code, session: abc123, part-of: goal:g1)');
    expect(prDocBody(TPL, vars)).toContain('- [ ] task:pr-41 page link on the session #in-progress (worker: claude-code, session: abc123)\n');
    expect(prDocBody(TPL, { ...vars, task: 'task:x.y' })).toContain('## Tasks\n\n_`- [ ] task:` lines, `part of pr:41`; their check state is what is in progress._\n\n![[task:x.y]]\n');
    expect(prDocBody(TPL, { ...vars, task: 'task:x.y' })).toContain('started: 2026-09-18T12:00:00.000Z\ntask: task:x.y\npart-of:');
    expect(prDocBody(TPL, vars)).not.toMatch(/^task:/m);
    expect(requestTaskStatusOnEnd('in-progress', 'done')).toBe('review');
    expect(requestTaskStatusOnEnd('done', 'done')).toBe('done');
    expect(requestTaskStatusOnEnd('in-progress', 'cancelled')).toBe('todo');
  });
  it('drops part-of and the from line when there is nothing to say', () => {
    const md = prDocBody(TPL, { ...vars, parent: '', from: '' });
    expect(md).not.toMatch(/^part-of:/m);
    expect(md).toContain('> should be a plan\n\n## Context');
  });
});

describe('fromLine', () => {
  it('names the document and the refs as tags, once each', () => {
    expect(fromLine({ refs: ['module:x', 'task:y'], source: {} }, 'module:x')).toBe('_from: module:x · refs: task:y_');
    expect(fromLine({ refs: [], source: {} })).toBe('');
  });
});

describe('resultSection / withResult', () => {
  const s = { id: 'abc123', product: 'p', status: 'done' as const, result: 'shipped **x**', artifacts: { docs: [], nodes: [], blocks: [{ id: 'req:a', change: 'added' as const, doc: 'module:m', title: 'A req', at: 't1' }, { id: 'task:t', change: 'changed' as const, doc: 'module:m', title: 'T', at: 't2' }, { id: 'block:1', change: 'added' as const, doc: 'module:m', title: 'a paragraph', at: 't3' }] } };
  it('renders the summary, the blocks (id never first on the line) and the paragraph count', () => {
    const out = resultSection(s);
    expect(out).toBe('shipped **x**\n\nBlocks this request produced:\n\n- added req:a — A req\n- changed task:t — T\n\n1 paragraph added or changed — [per document](/p/sessions/abc123/changes)');
    expect(resultSection({ ...s, result: undefined, artifacts: undefined })).toBe('_The session ended with status done and no summary._');
  });
  it('keeps only the blocks inside the plan\'s window and leaves out the plan\'s own pages', () => {
    const blocks = [{ id: 'req:old', change: 'added' as const, doc: 'module:m', title: 'before', at: '2026-09-18T10:00:00Z' }, { id: 'req:in', change: 'added' as const, doc: 'module:m', title: 'inside', at: '2026-09-18T12:30:00Z' }, { id: 'pr:pr-x', change: 'added' as const, doc: 'pr:pr-x', title: 'the plan itself', at: '2026-09-18T12:31:00Z' }, { id: 'module:v2-prs', change: 'added' as const, doc: 'module:v2-prs', title: 'Plans', at: '2026-09-18T12:31:00Z' }, { id: 'block:9', change: 'added' as const, doc: 'module:m', title: 'p', at: '2026-09-18T09:00:00Z' }, { id: 'req:late', change: 'added' as const, doc: 'module:m', title: 'after', at: '2026-09-18T14:00:00Z' }];
    const out = resultSection({ ...s, artifacts: { docs: [], nodes: [], blocks } }, { started: '2026-09-18T12:00:00Z', finished: '2026-09-18T13:00:00Z', exclude: ['pr:pr-x', 'module:v2-prs'] });
    expect(out).toBe('shipped **x**\n\nBlocks this request produced:\n\n- added req:in — inside');
  });
  it('owns the Result section: replaces what is under it every time, appends the heading when missing', () => {
    const md = prDocBody(TPL, vars);
    const done = withResult(md, 'RESULT');
    expect(done).toMatch(/## Result\n\nRESULT\n$/);
    expect(done).not.toContain('Written by the app');
    expect(withResult(done, 'AGAIN')).toMatch(/## Result\n\nAGAIN\n$/);
    expect(withResult(withResult(done, 'AGAIN'), 'AGAIN')).toBe(withResult(done, 'AGAIN'));
    expect(withResult('# t\n\n## Result\n\nmine\n\n## After\n\nx\n', 'R')).toBe('# t\n\n## Result\n\nR\n\n## After\n\nx\n');
    expect(withResult('# t\n\ntext\n', 'R')).toBe('# t\n\ntext\n\n## Result\n\nR\n');
  });
});

describe('getFrontmatter / prStatusOnEnd', () => {
  it('reads a key from the frontmatter', () => {
    const md = prDocBody(TPL, vars);
    expect(getFrontmatter(md, 'started')).toBe('2026-09-18T12:00:00.000Z');
    expect(getFrontmatter(md, 'finished')).toBeUndefined();
    expect(getFrontmatter('no frontmatter', 'x')).toBeUndefined();
  });
  it('maps the session end to the plan status; an unfinished plan replaced by a fresh request is cancelled', () => {
    expect(prStatusOnEnd('done')).toBe('done');
    expect(prStatusOnEnd('failed')).toBe('failed');
    expect(prStatusOnEnd('cancelled')).toBe('cancelled');
    expect(prStatusOnEnd('running')).toBe('cancelled');
  });
});

describe('prsOf', () => {
  const node = (id: string, body: string, file = 'projects/v2/docs/' + id.split(':')[1] + '.md', status = 'proposed', kind = id.split(':')[0]) => ({ id, kind, title: 't ' + id, status, body, file, defined: true });
  const graph = {
    nodes: [
      node('pr:2', 'session: s1\nstarted: 2026-09-18T12:00:00Z\nfinished: 2026-09-18', 'projects/v2/docs/pr-2.md', 'done'),
      node('pr:1', 'session: s1\nstarted: 2026-09-18T10:00:00Z', 'projects/v2/docs/pr-1.md', 'draft'),
      node('pr:pr-other', 'session: s2\nstarted: 2026-09-18T11:00:00Z'),
      node('pr:pr-none', 'nothing'),
      node('task:a1', 'x', 'projects/v2/docs/plan-a.md', 'done'), node('task:a2', 'x', 'projects/v2/docs/plan-a.md', 'open'), node('task:a3', 'x', 'projects/v2/docs/plan-a.md', 'in-progress'),
    ],
    edges: [{ from: 'task:a1', to: 'pr:1', verb: 'part-of' }, { from: 'task:a2', to: 'pr:1', verb: 'part-of' }, { from: 'task:a3', to: 'pr:1', verb: 'part-of' }, { from: 'task:a3', to: 'pr:2', verb: 'mentions' }],
  };
  it('lists a session\'s plans from the graph, oldest first, with their task counts', () => {
    expect(prsOf('waterfall', graph, 's1')).toEqual([
      { ref: 'waterfall/v2/pr-1', node: 'pr:1', title: '#1 t pr:1', status: 'draft', started: '2026-09-18T10:00:00Z', finished: undefined, tasks: { done: 1, total: 3 } },
      { ref: 'waterfall/v2/pr-2', node: 'pr:2', title: '#2 t pr:2', status: 'done', started: '2026-09-18T12:00:00Z', finished: '2026-09-18', tasks: { done: 0, total: 0 } },
    ]);
    expect(prsOf('waterfall', graph, 'nobody')).toEqual([]);
  });
});

describe('setFrontmatter', () => {
  it('sets an existing key and adds a new one', () => {
    const md = setFrontmatter(prDocBody(TPL, vars), 'status', 'done');
    expect(md).toMatch(/^---\n[\s\S]*?\nstatus: done\n/);
    expect(setFrontmatter(md, 'finished', '2026-09-18')).toMatch(/\nfinished: 2026-09-18\n---/);
  });
});

describe('the Definition (decision:wf2.pr-lifecycle, req:exec.plan-defined)', () => {
  const md = `---\nnode: pr:pr-x\ntype: pr\nstatus: refining\n---\n\n# x\n\n## Context\n\nstuff\n\n## Definition\n\n_intro_\n\n![[req:a.one]]\n\n\`\`\`yaml\n- id: decision:a.d\n  title: D\n  status: proposed\n\`\`\`\n\n- [ ] task:a.t Do it #proposed\n\n## Plan\n\nmore\n`;
  it('reads embedded, card and prose ids under Definition and embeds new ones once', () => {
    expect(definitionIds(md)).toEqual(['req:a.one', 'decision:a.d', 'task:a.t']);
    const next = withDefinition(md, ['req:a.one', 'question:a.q']);
    expect(definitionIds(next)).toEqual(['req:a.one', 'decision:a.d', 'task:a.t', 'question:a.q']);
    expect(next).toContain('- [ ] task:a.t Do it #proposed\n\n![[question:a.q]]\n\n## Plan');
    expect(withDefinition(next, ['question:a.q'])).toBe(next);
    const noSection = withDefinition('---\nnode: pr:p\n---\n\n## Context\n\nc\n\n## Tasks\n\np\n', ['req:z']);
    expect(noSection).toContain('## Context\n\nc\n\n## Definition\n\n![[req:z]]\n\n## Tasks');
  });
  it('is defined when every block is agreed — a task once it is work — and no open contradiction touches one', () => {
    const lookup = (m: Record<string, { status: string; openContradictions: string[] }>) => (id: string) => m[id] ?? null;
    const ids = definitionIds(md);
    expect(definitionState(ids, lookup({ 'req:a.one': { status: 'approved', openContradictions: [] }, 'decision:a.d': { status: 'draft', openContradictions: [] }, 'task:a.t': { status: 'draft', openContradictions: [] } }))).toMatchObject({ total: 3, agreed: 1, open: 2, defined: false });
    const all = lookup({ 'req:a.one': { status: 'approved', openContradictions: [] }, 'decision:a.d': { status: 'approved', openContradictions: [] }, 'task:a.t': { status: 'open', openContradictions: [] } });
    expect(definitionState(ids, all).defined).toBe(true);
    const contra = lookup({ 'req:a.one': { status: 'approved', openContradictions: ['contradiction:x'] }, 'decision:a.d': { status: 'approved', openContradictions: [] }, 'task:a.t': { status: 'open', openContradictions: [] } });
    expect(definitionState(ids, contra)).toMatchObject({ defined: false, contradicted: ['req:a.one'] });
    expect(definitionState(['req:gone'], () => null)).toMatchObject({ missing: 1, defined: false });
  });
});

describe('readiness', () => {
  const d = (items: { id: string; status: string; agreed: boolean }[], contradicted: string[] = []) => definitionState(items.map(i => i.id), id => { const it = items.find(i => i.id === id)!; return { status: it.status, openContradictions: contradicted.includes(id) ? ['contradiction:x'] : [] }; });
  it('is green only when everything holds', () => {
    const r = readiness(d([{ id: 'req:a', status: 'approved', agreed: true }]), 1);
    expect(r).toEqual({ definition: true, agreed: true, impact: true, contradictions: true, tasks: true, ok: true, unagreed: [], contradicted: [] });
  });
  it('names what is unagreed and contradicted, and misses tasks', () => {
    const r = readiness(d([{ id: 'req:a', status: 'proposed', agreed: false }, { id: 'rule:b', status: 'approved', agreed: true }], ['rule:b']), 0);
    expect(r.ok).toBe(false); expect(r.agreed).toBe(false); expect(r.unagreed).toEqual(['req:a']); expect(r.contradictions).toBe(false); expect(r.contradicted).toEqual(['rule:b']); expect(r.tasks).toBe(false);
  });
  it('an empty Definition is not ready', () => { expect(readiness(d([]), 2).definition).toBe(false); });
  it('taskLines reads the Tasks section', () => {
    expect(taskLines('# X\n\n## Tasks\n\n- [ ] task:a.one Do one #open\n- [x] task:a.two Done\n\n## Result\n')).toEqual(['task:a.one', 'task:a.two']);
  });
});
