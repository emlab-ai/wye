import { describe, it, expect } from 'vitest';
import { parseStage, workflowOf, workflowsOf, admits, nextStage, readinessOf, parseRun, runCard, replaceCard, runSlug, logLine, autoRun, LIVE, type RunCtx, type RunState, type StageDef } from './runs';
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

describe('readiness', () => {
  const PRD = 'data/products/p/projects/x/docs/prd.md';
  const prdDoc = node('module:prd', { file: PRD });
  const ctxOf = (nodes: GraphNode[], edges: GraphEdge[] = [], over: Partial<RunCtx> = {}): RunCtx => {
    const all = [prdDoc, ...nodes];
    const out = new Map<string, GraphEdge[]>();
    for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e]);
    return { graph: { nodes: all }, idx: { byId: new Map(all.map(n => [n.id, n])), out }, docs: { prd: 'module:prd' }, sessions: [], checkErrors: 0, ...over };
  };
  const stage = (until: string): StageDef => parseStage(node('stage:s', { body: `do: task "x" --worker agent\nuntil: ${until}` }))!;

  it('every req in prd is agreed — names the ones that are not', () => {
    const r = readinessOf(stage('every req in prd is agreed'), ctxOf([node('req:a', { file: PRD, status: 'approved' }), node('req:b', { file: PRD, status: 'proposed' })]));
    expect(r.ok).toBe(false); expect(r.rows[0].blocking).toEqual(['req:b']);
  });
  it('every req in prd has satisfied-by — a dangling target does not count', () => {
    const nodes = [node('req:a', { file: PRD, status: 'approved' }), node('req:b', { file: PRD, status: 'approved' }), node('decision:d', { file: 'x.md' })];
    const edges: GraphEdge[] = [{ from: 'req:a', verb: 'satisfied-by', to: 'decision:d' }, { from: 'req:b', verb: 'satisfied-by', to: 'decision:ghost' }];
    const r = readinessOf(stage('every req in prd has satisfied-by'), ctxOf(nodes, edges));
    expect(r.ok).toBe(false); expect(r.rows[0].blocking).toEqual(['req:b']);
  });
  it('session done, tasks ready and done, open questions, contradictions, check', () => {
    expect(readinessOf(stage('session done'), ctxOf([], [], { sessions: [{ id: 's1', status: 'done' }] })).ok).toBe(true);
    expect(readinessOf(stage('session done'), ctxOf([], [], { sessions: [{ id: 's1', status: 'running' }] })).rows[0].blocking).toEqual(['session:s1']);
    expect(readinessOf(stage('every task in prd is ready'), ctxOf([node('task:t', { file: PRD, body: 'id: task:t\nready: true' })])).ok).toBe(true);
    expect(readinessOf(stage('every task in prd is ready'), ctxOf([node('task:t', { file: PRD, body: 'id: task:t' })])).ok).toBe(false);
    expect(readinessOf(stage('every task in prd is done'), ctxOf([node('task:t', { file: PRD, status: 'done' })])).ok).toBe(true);
    expect(readinessOf(stage('no open question in prd'), ctxOf([node('question:q', { file: PRD, status: 'answered' })])).ok).toBe(true);
    expect(readinessOf(stage('no open question in prd'), ctxOf([node('question:q', { file: PRD, status: '' })])).rows[0].blocking).toEqual(['question:q']);
    expect(readinessOf(stage('check passes'), ctxOf([], [], { checkErrors: 2 })).ok).toBe(false);
    expect(readinessOf(stage('manual'), ctxOf([])).ok).toBe(true);
  });
  it('every req in prd has a task — a task part-of the req counts', () => {
    const nodes = [node('req:a', { file: PRD }), node('task:t', { file: 'plan.md' })];
    const edges: GraphEdge[] = [{ from: 'task:t', verb: 'part-of', to: 'req:a' }];
    expect(readinessOf(stage('every req in prd has a task'), ctxOf(nodes, edges)).ok).toBe(true);
    expect(readinessOf(stage('every req in prd has a task'), ctxOf(nodes)).rows[0].blocking).toEqual(['req:a']);
  });
  it('an empty PRD is not green, an unbound document is not green, a bad until is not green', () => {
    expect(readinessOf(stage('every req in prd is agreed'), ctxOf([])).ok).toBe(false);
    expect(readinessOf(stage('every req in plan is agreed'), ctxOf([])).ok).toBe(false);
    const s = parseStage(node('stage:s', { body: 'do: task "x"\nuntil: when it feels right' }))!;
    const r = readinessOf(s, ctxOf([]));
    expect(r.ok).toBe(false); expect(r.rows[0].label).toContain('when it feels right');
  });
});

describe('the run card', () => {
  const r: RunState = { id: 'run:feature-3', workflow: 'workflow:feature', on: 'module:idea', stage: 'stage:f.prd', status: 'waiting', produced: ['module:idea-prd'], sessions: ['abc123'], started: '2026-09-22', log: ['started — by person', 'advanced stage:f.research — by person, every session done'] };
  it('round-trips through yaml, log and all', () => {
    const md = runCard(r);
    expect(md).toContain('- id: run:feature-3');
    expect(md).toContain('  workflow: workflow:feature');
    expect(md).toContain('  produced: [module:idea-prd]');
    const back = parseRun(node('run:feature-3', { status: 'waiting', body: md.replace(/^- /, '').replace(/^ {2}/gm, '') }))!;
    expect(back).toEqual(r);
  });
  it('replaces a card in place, leaving its neighbours alone', () => {
    const md = `# Runs\n\n\`\`\`yaml\n${runCard({ ...r, id: 'run:a' })}${runCard({ ...r, id: 'run:b', log: [] })}\`\`\`\n`;
    const next = replaceCard(md, 'run:a', runCard({ ...r, id: 'run:a', status: 'done', log: [] }))!;
    expect(next).toContain('- id: run:a\n  workflow: workflow:feature\n  on: module:idea\n  stage: stage:f.prd\n  status: done');
    expect(next).toContain('- id: run:b');
    expect(next.match(/- id: run:/g)).toHaveLength(2);
    expect(replaceCard(md, 'run:ghost', 'x')).toBeNull();
  });
  it('numbers a run after the ones already taken, knows which are live, and caps an auto chain', () => {
    expect(runSlug('workflow:feature', ['run:feature-1', 'run:other-7'])).toBe('run:feature-2');
    expect(runSlug('workflow:feature', [])).toBe('run:feature-1');
    expect([...LIVE]).toEqual(['running', 'waiting', 'blocked']);
    expect(autoRun(['started — by person', 'advanced s1 — by the engine, auto', 'advanced s2 — by the engine, auto'])).toBe(2);
    expect(autoRun(['advanced s1 — by the engine, auto', 'advanced s2 — by person, ok'])).toBe(0);
  });
  it('writes a log line naming who did what', () => {
    expect(logLine({ what: 'advanced', stage: 'stage:f.prd', by: 'person', detail: 'every req in prd is agreed' }))
      .toBe('advanced stage:f.prd — by person, every req in prd is agreed');
  });
});
