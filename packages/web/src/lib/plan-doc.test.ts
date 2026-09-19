import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planSlug, planTitle, planDocBody, fromLine, resultSection, withResult, setFrontmatter, getFrontmatter, plansOf, planStatusOnEnd, requestTaskStatusOnEnd } from './plan-doc';

const TPL = readFileSync(path.join(__dirname, '../../../../templates/docs/plan-request.md'), 'utf8');
const vars = { slug: 'plan-page-link-session', title: 'page link on the session', date: '2026-09-18', session: 'abc123', agent: 'claude-code', parent: 'module:app-agents', started: '2026-09-18T12:00:00.000Z', request: 'page link on the session, it looks good\n\n## but\nshould be a plan', from: '_from: module:app-agents · refs: req:x_' };

describe('planSlug / planTitle', () => {
  it('takes the telling words of the request and skips taken slugs', () => {
    expect(planSlug('page link on the session, it looks good, but should be done in a different way')).toBe('plan-page-link-session-looks-good-but');
    expect(planSlug('Add a page X', ['plan-add-page-x'])).toBe('plan-add-page-x-2');
    expect(planSlug('Add a page X', ['plan-add-page-x', 'plan-add-page-x-2'])).toBe('plan-add-page-x-3');
    expect(planSlug('')).toBe('plan-request');
  });
  it('titles from the first line, markdown stripped and cut', () => {
    expect(planTitle('\n# **Fix** the [thing](http://x)\nmore')).toBe('Fix the thing');
    expect(planTitle('w '.repeat(80))).toMatch(/…$/);
  });
});

describe('planDocBody', () => {
  it('fills the template: typed frontmatter, the request quoted, the from line, the sections', () => {
    const md = planDocBody(TPL, vars);
    expect(md).toMatch(/^---\nnode: plan:plan-page-link-session\ntype: plan\ntitle: page link on the session\n/);
    expect(md).toContain('session: abc123\nagent: claude-code\nstarted: 2026-09-18T12:00:00.000Z\npart-of: module:app-agents\n---');
    expect(md).toContain('## Request\n\n> page link on the session, it looks good\n> \n> ## but\n> should be a plan\n\n_from: module:app-agents · refs: req:x_\n\n## Context');
    for (const h of ['## Context', '## Plan', '## Tasks', '## Result']) expect(md).toContain(h);
    expect(md).toContain('part of plan:plan-page-link-session');
  });
  it('writes the request as a task line under Tasks with the worker and the session (req:exec.request-is-a-task)', () => {
    const md = planDocBody(TPL, { ...vars, title: 'Fix (the) #thing', partOf: 'goal:g1' });
    expect(md).toContain('- [ ] task:plan-page-link-session Fix the thing #in-progress (worker: claude-code, session: abc123, part-of: goal:g1)');
    expect(planDocBody(TPL, vars)).toContain('- [ ] task:plan-page-link-session page link on the session #in-progress (worker: claude-code, session: abc123)\n');
    expect(planDocBody(TPL, { ...vars, task: 'task:x.y' })).toContain('## Tasks\n\n_`- [ ] task:` lines, `part of plan:plan-page-link-session`; their check state is what is in progress._\n\n![[task:x.y]]\n');
    expect(planDocBody(TPL, { ...vars, task: 'task:x.y' })).toContain('started: 2026-09-18T12:00:00.000Z\ntask: task:x.y\npart-of:');
    expect(planDocBody(TPL, vars)).not.toMatch(/^task:/m);
    expect(requestTaskStatusOnEnd('in-progress', 'done')).toBe('review');
    expect(requestTaskStatusOnEnd('done', 'done')).toBe('done');
    expect(requestTaskStatusOnEnd('in-progress', 'cancelled')).toBe('todo');
  });
  it('drops part-of and the from line when there is nothing to say', () => {
    const md = planDocBody(TPL, { ...vars, parent: '', from: '' });
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
    expect(out).toBe('shipped **x**\n\nBlocks this plan produced:\n\n- added req:a — A req\n- changed task:t — T\n\n1 paragraph added or changed — [per document](/p/sessions/abc123/changes)');
    expect(resultSection({ ...s, result: undefined, artifacts: undefined })).toBe('_The session ended with status done and no summary._');
  });
  it('keeps only the blocks inside the plan\'s window and leaves out the plan\'s own pages', () => {
    const blocks = [{ id: 'req:old', change: 'added' as const, doc: 'module:m', title: 'before', at: '2026-09-18T10:00:00Z' }, { id: 'req:in', change: 'added' as const, doc: 'module:m', title: 'inside', at: '2026-09-18T12:30:00Z' }, { id: 'plan:plan-x', change: 'added' as const, doc: 'plan:plan-x', title: 'the plan itself', at: '2026-09-18T12:31:00Z' }, { id: 'module:v2-plans', change: 'added' as const, doc: 'module:v2-plans', title: 'Plans', at: '2026-09-18T12:31:00Z' }, { id: 'block:9', change: 'added' as const, doc: 'module:m', title: 'p', at: '2026-09-18T09:00:00Z' }, { id: 'req:late', change: 'added' as const, doc: 'module:m', title: 'after', at: '2026-09-18T14:00:00Z' }];
    const out = resultSection({ ...s, artifacts: { docs: [], nodes: [], blocks } }, { started: '2026-09-18T12:00:00Z', finished: '2026-09-18T13:00:00Z', exclude: ['plan:plan-x', 'module:v2-plans'] });
    expect(out).toBe('shipped **x**\n\nBlocks this plan produced:\n\n- added req:in — inside');
  });
  it('owns the Result section: replaces what is under it every time, appends the heading when missing', () => {
    const md = planDocBody(TPL, vars);
    const done = withResult(md, 'RESULT');
    expect(done).toMatch(/## Result\n\nRESULT\n$/);
    expect(done).not.toContain('Written by the app');
    expect(withResult(done, 'AGAIN')).toMatch(/## Result\n\nAGAIN\n$/);
    expect(withResult(withResult(done, 'AGAIN'), 'AGAIN')).toBe(withResult(done, 'AGAIN'));
    expect(withResult('# t\n\n## Result\n\nmine\n\n## After\n\nx\n', 'R')).toBe('# t\n\n## Result\n\nR\n\n## After\n\nx\n');
    expect(withResult('# t\n\ntext\n', 'R')).toBe('# t\n\ntext\n\n## Result\n\nR\n');
  });
});

describe('getFrontmatter / planStatusOnEnd', () => {
  it('reads a key from the frontmatter', () => {
    const md = planDocBody(TPL, vars);
    expect(getFrontmatter(md, 'started')).toBe('2026-09-18T12:00:00.000Z');
    expect(getFrontmatter(md, 'finished')).toBeUndefined();
    expect(getFrontmatter('no frontmatter', 'x')).toBeUndefined();
  });
  it('maps the session end to the plan status; an unfinished plan replaced by a fresh request is cancelled', () => {
    expect(planStatusOnEnd('done')).toBe('done');
    expect(planStatusOnEnd('failed')).toBe('failed');
    expect(planStatusOnEnd('cancelled')).toBe('cancelled');
    expect(planStatusOnEnd('running')).toBe('cancelled');
  });
});

describe('plansOf', () => {
  const node = (id: string, body: string, file = 'projects/v2/docs/' + id.split(':')[1] + '.md', status = 'proposed', kind = id.split(':')[0]) => ({ id, kind, title: 't ' + id, status, body, file, defined: true });
  const graph = {
    nodes: [
      node('plan:plan-b', 'session: s1\nstarted: 2026-09-18T12:00:00Z\nfinished: 2026-09-18', undefined, 'done'),
      node('plan:plan-a', 'session: s1\nstarted: 2026-09-18T10:00:00Z', undefined, 'proposed'),
      node('plan:plan-other', 'session: s2\nstarted: 2026-09-18T11:00:00Z'),
      node('plan:plan-none', 'nothing'),
      node('task:a1', 'x', 'projects/v2/docs/plan-a.md', 'done'), node('task:a2', 'x', 'projects/v2/docs/plan-a.md', 'open'), node('task:a3', 'x', 'projects/v2/docs/plan-a.md', 'in-progress'),
    ],
    edges: [{ from: 'task:a1', to: 'plan:plan-a', verb: 'part-of' }, { from: 'task:a2', to: 'plan:plan-a', verb: 'part-of' }, { from: 'task:a3', to: 'plan:plan-a', verb: 'part-of' }, { from: 'task:a3', to: 'plan:plan-b', verb: 'mentions' }],
  };
  it('lists a session\'s plans from the graph, oldest first, with their task counts', () => {
    expect(plansOf('waterfall', graph, 's1')).toEqual([
      { ref: 'waterfall/v2/plan-a', node: 'plan:plan-a', title: 't plan:plan-a', status: 'proposed', started: '2026-09-18T10:00:00Z', finished: undefined, tasks: { done: 1, total: 3 } },
      { ref: 'waterfall/v2/plan-b', node: 'plan:plan-b', title: 't plan:plan-b', status: 'done', started: '2026-09-18T12:00:00Z', finished: '2026-09-18', tasks: { done: 0, total: 0 } },
    ]);
    expect(plansOf('waterfall', graph, 'nobody')).toEqual([]);
  });
});

describe('setFrontmatter', () => {
  it('sets an existing key and adds a new one', () => {
    const md = setFrontmatter(planDocBody(TPL, vars), 'status', 'done');
    expect(md).toMatch(/^---\n[\s\S]*?\nstatus: done\n/);
    expect(setFrontmatter(md, 'finished', '2026-09-18')).toMatch(/\nfinished: 2026-09-18\n---/);
  });
});
