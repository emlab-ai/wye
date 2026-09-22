import { describe, it, expect } from 'vitest';
import { parseStage, workflowOf, workflowsOf, admits, nextStage } from './runs';
import type { GraphData, GraphEdge, GraphNode } from './graph';

// workflows (decision:wf2.workflow-is-a-skill): a workflow is a skill whose stage cards are its steps, in document order
const node = (id: string, o: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: o.title ?? id, status: o.status ?? '', section: '', subsection: '', file: o.file ?? 'data/products/p/projects/x/docs/workflow-feature.md', line: o.line ?? 1, body: o.body ?? '', defined: true, ...o });
const incOf = (edges: GraphEdge[]) => { const m = new Map<string, GraphEdge[]>(); for (const e of edges) m.set(e.to, [...(m.get(e.to) ?? []), e]); return { inc: m }; };

describe('stage cards', () => {
  it('parses actions, produces, until, gate and the defaults', () => {
    const s = parseStage(node('stage:f.prd', { body: 'id: stage:f.prd\ntitle: Write the PRD\ndo: task "Write the PRD for {{title}} in {{prd}}" --worker agent --skill skill:prd\nproduces: prd\nuntil: every req in prd is agreed, no open question in prd\ngate: person' }))!;
    expect(s.actions).toEqual([{ kind: 'task', text: 'Write the PRD for {{title}} in {{prd}}', worker: 'agent', skill: 'skill:prd' }]);
    expect(s.produces).toEqual(['prd']);
    expect(s.until).toEqual([{ kind: 'reqs-agreed', doc: 'prd' }, { kind: 'no-open-question', doc: 'prd' }]);
    expect(s.gate).toBe('person');
    expect(s.badUntil).toEqual([]);
  });
  it('defaults: gate person, until session-done when it starts sessions, manual when it does not', () => {
    expect(parseStage(node('stage:a', { body: 'do: task "x" --worker agent' }))!.until).toEqual([{ kind: 'session-done' }]);
    expect(parseStage(node('stage:a', { body: 'title: A review stop' }))!.until).toEqual([{ kind: 'manual' }]);
    expect(parseStage(node('stage:a', { body: 'do: task "x"\ngate: auto' }))!.gate).toBe('auto');
    expect(parseStage(node('stage:a', { body: 'do: task "x"\nauto: true' }))!.gate).toBe('auto');
    expect(parseStage(node('req:a'))).toBeNull();
  });
  it('reads several do lines, a worker and skills', () => {
    const s = parseStage(node('stage:a', { body: 'do: |\n  task "one" --worker agent\n  task "two" --worker agent\nworker: codex\nskills: [skill:house]' }))!;
    expect(s.actions).toHaveLength(2); expect(s.worker).toBe('codex'); expect(s.skills).toEqual(['skill:house']);
  });
  it('keeps an unparseable until as badUntil, never as a true criterion', () => {
    const s = parseStage(node('stage:a', { body: 'do: task "x"\nuntil: when it feels right' }))!;
    expect(s.until).toEqual([]); expect(s.badUntil).toEqual(['when it feels right']);
  });
});

describe('a workflow', () => {
  const wf = node('workflow:feature', { title: 'Feature', status: 'active', body: 'id: workflow:feature\ntakes: module, goal' });
  const s1 = node('stage:f.research', { line: 20, body: 'do: task "r" --worker agent' });
  const s2 = node('stage:f.prd', { line: 30, body: 'do: task "p" --worker agent' });
  const g = { nodes: [wf, s2, s1] } as Pick<GraphData, 'nodes'>;
  const edges: GraphEdge[] = [{ from: 'stage:f.research', verb: 'part-of', to: 'workflow:feature' }, { from: 'stage:f.prd', verb: 'part-of', to: 'workflow:feature' }];
  it('collects its stages in document order and reads takes', () => {
    const w = workflowOf(g, incOf(edges), 'workflow:feature')!;
    expect(w.stages.map(s => s.id)).toEqual(['stage:f.research', 'stage:f.prd']);
    expect(w.takes).toEqual(['module', 'goal']);
    expect(admits(w, 'module')).toBe(true); expect(admits(w, 'req')).toBe(false);
    expect(nextStage(w, 'stage:f.research')!.id).toBe('stage:f.prd');
    expect(nextStage(w, 'stage:f.prd')).toBeNull();
    expect(workflowsOf(g, incOf(edges)).map(x => x.id)).toEqual(['workflow:feature']);
  });
  it('admits every kind when takes is * or absent, and falls back to the document for stages', () => {
    const bare = node('workflow:w', { body: 'id: workflow:w', file: 'w.md' });
    const w = workflowOf({ nodes: [bare, node('stage:w.one', { line: 9, file: 'w.md' })] }, incOf([]), 'workflow:w')!;
    expect(admits(w, 'anything')).toBe(true);
    expect(w.stages.map(s => s.id)).toEqual(['stage:w.one']);
  });
});
