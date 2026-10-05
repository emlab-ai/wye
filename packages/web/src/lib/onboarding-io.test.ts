import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GraphData, GraphNode, GraphEdge } from './graph';
import type { Scope } from './scope';
import { signalsOf, readOnboarding, markStep, setDismissed, marksOf, prPagesOf } from './onboarding-io';
import { readSettings } from './settings';

// the Quick start's signals, read in one pass over the graph (docs/superpowers/specs/2026-10-05-onboarding-design.md)
const D = 'data/products/t/projects/main';
const node = (id: string, file: string, p: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file, line: 1, ...p });
const scopeOf = (nodes: GraphNode[], edges: GraphEdge[], modules: string[]): Pick<Scope, 'graph' | 'projects'> => ({
  projects: [{ slug: 'main' }] as Scope['projects'],
  graph: { generatedAt: '', files: [], fieldIndex: {}, nodes, edges, modules: modules.map(id => ({ id, title: id, file: nodes.find(n => n.id === id)!.file, verified: '', sourceRoots: [] })) } as GraphData,
});
const AGENTS = { claude: true, codex: false };

describe('signalsOf', () => {
  const nodes = [
    node('module:a', `${D}/docs/a.md`, { kind: 'module' }),
    node('req:a.one', `${D}/docs/a.md`, { status: 'approved' }),
    node('req:a.two', `${D}/docs/a.md`, { status: 'proposed' }),
    node('field:x', `${D}/docs/a.md`), // a hidden kind: not a block
    node('choice:a.two.c', `${D}/docs/a.md`), // a card's part: not a block on its own
    node('module:main-prs', `${D}/.wye/prs.md`, { kind: 'module' }),
    node('pr:1', `${D}/.wye/pr-1.md`, { status: 'building', body: 'started: 2026-10-01T10:00:00Z' }),
    node('pr:2', `${D}/.wye/pr-2.md`, { status: 'refining', body: 'started: 2026-10-02T10:00:00Z' }),
    node('decision:pr-2.x', `${D}/.wye/pr-2.md`, { status: 'approved' }), // approved by a person on a PR page
    node('hook:on-save', `${D}/.wye/hooks.md`, { status: 'active' }), // app-written: not the person's block
    node('module:goals', `${D}/.wye/goals.md`, { kind: 'module' }), // a .wye page: not a document
  ];
  const edges: GraphEdge[] = [
    { from: 'req:a.one', to: 'req:a.two', verb: 'refines' },
    { from: 'req:a.two', to: 'req:a.one', verb: 'refined-by', generated: true },
    { from: 'req:a.two', to: 'choice:a.two.c', verb: 'has' },
    { from: 'module:a', to: 'req:a.one', verb: 'has' },
    { from: 'pr:1', to: 'module:main-prs', verb: 'part-of' },
    { from: 'pr:2', to: 'module:main-prs', verb: 'part-of' },
  ];
  const sc = scopeOf(nodes, edges, ['module:a', 'module:main-prs', 'pr:1', 'pr:2', 'module:goals']);
  it('counts documents, blocks, links, approvals, PRs and builds', () => {
    expect(signalsOf(sc as Scope, AGENTS, ['ask'])).toEqual({ agent: true, documents: 1, blocks: 2, links: 1, approved: 2, prs: 2, built: 1, marked: ['ask'] });
  });
  it('no agent, an empty graph, no projects: all zero', () => {
    expect(signalsOf(scopeOf([], [], []) as Scope, { claude: false, codex: false }, [])).toEqual({ agent: false, documents: 0, blocks: 0, links: 0, approved: 0, prs: 0, built: 0, marked: [] });
    expect(signalsOf({ ...sc, projects: [] } as unknown as Scope, { claude: false, codex: true }, []).prs).toBe(0);
  });
  it('prPagesOf: the PRs page children, newest first', () => {
    expect(prPagesOf(sc.graph, ['main']).map(p => [p.id, p.status, p.project])).toEqual([['pr:2', 'refining', 'main'], ['pr:1', 'building', 'main']]);
  });
});

describe('onboarding marks', () => {
  it('a missing or broken settings file reads as nothing marked', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wf-onb-'));
    expect(marksOf(await readSettings(root), 'p')).toEqual({ done: [], dismissed: false });
    await writeFile(path.join(root, '_settings.json'), '{ not json');
    expect(marksOf(await readSettings(root), 'p')).toEqual({ done: [], dismissed: false });
    expect(marksOf({ onboarding: { p: { done: ['ask', 'bogus', 'ask'] } } }, 'p').done).toEqual(['ask']);
  });
  it('markStep twice leaves one entry; dismissing keeps marks and the other sections', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wf-onb-'));
    await writeFile(path.join(root, '_settings.json'), JSON.stringify({ timezone: 'Europe/London', agents: { parallel: 2 } }));
    await Promise.all([markStep('p', 'ask', root), markStep('p', 'ask', root), markStep('p', 'remember', root)]);
    await setDismissed('p', true, root);
    const s = JSON.parse(await readFile(path.join(root, '_settings.json'), 'utf8'));
    expect(s.onboarding.p.done.sort()).toEqual(['ask', 'remember']);
    expect(s.onboarding.p.dismissed).toBe(true);
    expect(s).toMatchObject({ timezone: 'Europe/London', agents: { parallel: 2 } });
  });
  it('markStep never throws, even where it cannot write', async () => {
    await expect(markStep('p', 'ask', path.join(os.tmpdir(), 'wf-onb-no-such', 'deeper'))).resolves.toBeUndefined();
  });
  it('readOnboarding of a product that does not exist is null', async () => {
    expect(await readOnboarding('no-such-product-zz')).toBeNull();
  });
});
