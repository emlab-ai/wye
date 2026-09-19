import { describe, it, expect } from 'vitest';
import { constraintsFor, renderPacket, constraintLine } from './packet';
import { indexGraph, type GraphData, type GraphNode } from './graph';

// the constraint packet (decision:memory.constraint-packet): structural, complete, current by construction
const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file: 'd.md', line: 1, ...extra });
const g: GraphData = {
  generatedAt: '', modules: [{ id: 'module:shop', title: 'Shop', file: 'd.md', verified: '', sourceRoots: [] }], files: ['d.md'], fieldIndex: {},
  nodes: [
    node('module:shop'),
    node('entity:price', { title: 'Price' }),
    node('rule:no-negative', { status: 'shipped', body: 'statement: A price is never negative\nsource: lib/price.js:12' }),
    node('constraint:local-first', { status: 'approved', body: 'statement: Writes land locally first' }),
    node('constraint:global', { status: 'approved', body: 'statement: Binds everything, no scope' }),
    node('constraint:proposed', { status: 'proposed', body: 'statement: Not yet in force' }),
    node('decision:gross', { status: 'approved', title: 'Prices are gross' }),
    node('decision:old', { status: 'approved', title: 'Prices are net', supersededBy: 'decision:gross', until: '2026-05-02' }),
    node('decision:maybe', { status: 'proposed', title: 'Not decided' }),
    node('goal:launch', { status: 'on-track', title: 'Launch' }),
    node('question:rounding', { status: 'open', body: 'q: Half-up or bankers?' }),
    node('question:done', { status: 'resolved', body: 'q: Old' }),
    node('rule:far', { status: 'shipped', body: 'statement: Three hops away' }),
    node('entity:far'),
  ],
  edges: [
    { from: 'rule:no-negative', to: 'entity:price', verb: 'governs' },
    { from: 'constraint:local-first', to: 'entity:price', verb: 'scope' },
    { from: 'decision:gross', to: 'entity:price', verb: 'affects' },
    { from: 'decision:old', to: 'entity:price', verb: 'affects' },
    { from: 'decision:maybe', to: 'entity:price', verb: 'affects' },
    { from: 'entity:price', to: 'goal:launch', verb: 'part-of' },
    { from: 'question:rounding', to: 'entity:price', verb: 'related-to' },
    { from: 'question:done', to: 'entity:price', verb: 'related-to' },
    { from: 'entity:far', to: 'entity:price', verb: 'depends-on' },
    { from: 'rule:far', to: 'entity:far', verb: 'governs' },
  ],
};
const idx = indexGraph(g);

describe('constraint packet', () => {
  const c = constraintsFor(g, idx, ['entity:price']);
  const ids = Object.values(c.byKind).flat().map(n => n.id);
  it('keeps every rule, constraint, approved decision and goal within two hops', () => {
    expect(ids).toContain('rule:no-negative'); expect(ids).toContain('constraint:local-first'); expect(ids).toContain('decision:gross'); expect(ids).toContain('goal:launch'); expect(ids).toContain('rule:far');
  });
  it('binds unscoped approved constraints everywhere; leaves proposed ones out', () => { expect(ids).toContain('constraint:global'); expect(ids).not.toContain('constraint:proposed'); expect(ids).not.toContain('decision:maybe'); });
  it('drops superseded decisions by construction and counts them', () => { expect(ids).not.toContain('decision:old'); expect(c.hidden).toBe(1); expect(constraintsFor(g, idx, ['entity:price'], { all: true }).byKind.decision.map(n => n.id)).toContain('decision:old'); });
  it('carries open questions on the kept nodes, not resolved ones', () => { expect(c.questions.map(q => q.id)).toEqual(['question:rounding']); });
  it('renders one line per node with the rule source, kinds in order', () => {
    const md = renderPacket(c);
    expect(md.indexOf('### Constraints')).toBeLessThan(md.indexOf('### Rules'));
    expect(md).toContain('- rule:no-negative [shipped] — A price is never negative (source: lib/price.js:12)');
    expect(md).toContain('1 superseded / retired hidden');
  });
  it('shares a small budget across kinds instead of spending it on the first', () => {
    const md = renderPacket(c, { budget: 420 });
    expect(md).toContain('### Goals'); expect(md).toContain('more not shown');
  });
  it('with unknown seeds only the unscoped constitution remains; with none of that, says so', () => {
    const md = renderPacket(constraintsFor(g, idx, ['nope:x']));
    expect(md).toContain('constraint:global'); expect(md).not.toContain('### Rules');
    const bare: GraphData = { ...g, nodes: g.nodes.filter(n => n.id !== 'constraint:global') };
    expect(renderPacket(constraintsFor(bare, indexGraph(bare), ['nope:x']))).toMatch(/No rules, constraints/);
  });
  it('constraintLine reads the q of a question', () => { expect(constraintLine(g.nodes.find(n => n.id === 'question:rounding')!)).toBe('- question:rounding [open] — Half-up or bankers?'); });
});
