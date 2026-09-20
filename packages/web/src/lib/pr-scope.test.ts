import { describe, it, expect } from 'vitest';
import { scopeIds, requestIds, overlap, conflicts, parseScope, withScope, scopeFresh, scopeHash } from './pr-scope';
import type { GraphData, GraphNode } from './graph';

// a PR's scope (decision:wf2.pr-scheduler): Definition + request tags + what impact reaches; overlap decides parallelism
const node = (id: string, body = '', file = 'p/x.md'): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: 'approved', section: '', subsection: '', file, line: 1, body, defined: true });
const g: GraphData = { generatedAt: '', modules: [], files: [], nodes: [node('req:a'), node('req:b'), node('rule:c'), node('decision:d'), node('pr:1', '', 'p/pr-1.md')], edges: [{ from: 'rule:c', to: 'req:a', verb: 'satisfies' }, { from: 'decision:d', to: 'req:b', verb: 'affects' }], fieldIndex: {} };
const md = '---\nnode: pr:1\ntype: pr\nstatus: approved\n---\n\n# X\n\n## Request\n\n> change req:b and the pr:1 page\n\n## Definition\n\n![[req:a]]\n\n## Tasks\n\n- [ ] task:pr-1 X #todo\n';

describe('pr scope', () => {
  it('collects the Definition, the request tags and what impact reaches, never a pr / session id', () => {
    expect(requestIds(md)).toEqual(['req:b']);
    const s = scopeIds(g, md);
    expect(s).toContain('req:a'); expect(s).toContain('req:b'); expect(s).not.toContain('pr:1');
    expect(s.length).toBeGreaterThanOrEqual(2);
  });
  it('overlap and conflicts name the shared ids', () => {
    expect(overlap(['a', 'b', 'c'], ['c', 'd'])).toEqual(['c']);
    expect(conflicts({ ref: 'p/pr-1', scope: ['req:a', 'req:b'] }, [{ ref: 'p/pr-2', num: 2, scope: ['req:b'] }, { ref: 'p/pr-3', num: 3, scope: ['rule:z'] }, { ref: 'p/pr-1', num: 1, scope: ['req:a'] }])).toEqual([{ ref: 'p/pr-2', num: 2, shared: ['req:b'] }]);
  });
  it('writes and reads the scope with its freshness hash', () => {
    const out = withScope(md, ['req:a', 'req:b']);
    expect(out).toMatch(/^scope: \[req:a, req:b\]$/m); expect(out).toMatch(/^scope-of: [0-9a-f]{8}$/m);
    expect(parseScope(out)).toEqual({ scope: ['req:a', 'req:b'], of: scopeHash(['req:a']) });
    expect(scopeFresh(out)).toBe(true); expect(scopeFresh(md)).toBe(false);
    expect(scopeFresh(out.replace('![[req:a]]', '![[req:a]]\n\n![[rule:c]]'))).toBe(false);
  });
});
