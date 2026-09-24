import { describe, it, expect } from 'vitest';
import { parseLayout, writeLayout, moveIn, dropIn, mapGraph, verbsFor, withLink, withoutLink, addCard } from './map';
import type { GraphData, GraphEdge, GraphNode, TypeDef } from './graph';

// a map page (decision:map.page-owns-its-nodes): its cards are the nodes, its Layout section holds where they sit
const FILE = 'data/products/p/projects/x/docs/map-auth.md';
const node = (id: string, o: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: o.title ?? id, status: '', section: '', subsection: '', file: o.file ?? FILE, line: o.line ?? 1, body: '', defined: true, ...o });
const page = (layout: string) => `---\nnode: map:auth\n---\n\n# Auth\n\nsome prose\n\n## Layout\n\n\`\`\`text\n${layout}\n\`\`\`\n`;

describe('the Layout section', () => {
  it('reads a position, a reference, and ignores what is not one', () => {
    expect(parseLayout(page('req:a 0,0\ndecision:b 260,-40 ref\nnot a line\n'))).toEqual([
      { id: 'req:a', x: 0, y: 0, ref: false },
      { id: 'decision:b', x: 260, y: -40, ref: true },
    ]);
    expect(parseLayout('# A page with no layout at all')).toEqual([]);
  });
  it('round-trips, rounding to whole pixels, and keeps the rest of the page', () => {
    const md = page('req:a 0,0');
    const out = writeLayout(md, [{ id: 'req:a', x: 12.4, y: -7.8, ref: false }, { id: 'req:b', x: 260, y: 0, ref: true }]);
    expect(out).toContain('some prose');
    expect(parseLayout(out)).toEqual([{ id: 'req:a', x: 12, y: -8, ref: false }, { id: 'req:b', x: 260, y: 0, ref: true }]);
    expect(out.match(/## Layout/g)).toHaveLength(1);
  });
  it('adds the section to a page that has none', () => {
    const out = writeLayout('---\nnode: map:auth\n---\n\n# Auth\n', [{ id: 'req:a', x: 1, y: 2, ref: false }]);
    expect(out).toContain('## Layout\n\n```text\nreq:a 1,2\n```');
    expect(parseLayout(out)).toHaveLength(1);
  });
  it('moves a node, adds one it has never seen, and drops one', () => {
    const spots = parseLayout(page('req:a 0,0\nreq:b 10,10'));
    expect(moveIn(spots, 'req:a', 50, 60).find(s => s.id === 'req:a')).toEqual({ id: 'req:a', x: 50, y: 60, ref: false });
    expect(moveIn(spots, 'req:c', 1, 2, true)).toHaveLength(3);
    expect(dropIn(spots, 'req:a').map(s => s.id)).toEqual(['req:b']);
  });
});

describe('a new card on a map page', () => {
  it('goes above the Layout section, in the fence the page already has', () => {
    const md = `---\nnode: map:auth\n---\n\n# Auth\n\n\`\`\`yaml\n- id: req:a\n  title: A\n\`\`\`\n\n## Layout\n\n\`\`\`text\nreq:a 0,0\n\`\`\`\n`;
    const out = addCard(md, '- id: req:b\n  title: B');
    expect(out.indexOf('req:b')).toBeLessThan(out.indexOf('## Layout'));
    expect(out.match(/```yaml/g)).toHaveLength(1);
    expect(parseLayout(out)).toEqual([{ id: 'req:a', x: 0, y: 0, ref: false }]);
  });
  it('opens a fence above the Layout section on a page that has no cards yet', () => {
    const out = addCard(`# Auth\n\n## Layout\n\n\`\`\`text\n\`\`\`\n`, '- id: req:a');
    expect(out).toContain('```yaml\n- id: req:a\n```');
    expect(out.indexOf('- id: req:a')).toBeLessThan(out.indexOf('## Layout'));
  });
});

describe('what the canvas draws', () => {
  const elsewhere = 'data/products/p/projects/x/docs/other.md';
  const g = {
    nodes: [node('map:auth'), node('req:a'), node('decision:b'), node('block:map-auth.abc', { form: 'block' }), node('req:far', { file: elsewhere }), node('req:gone', { file: elsewhere, defined: false })],
    edges: [
      { from: 'req:a', verb: 'part-of', to: 'decision:b' },
      { from: 'req:a', verb: 'refines', to: 'req:far' },
      { from: 'req:a', verb: 'mentions', to: 'req:gone' },
      { from: 'req:a', verb: 'has', to: 'req:a' },
      { from: 'req:a', verb: 'satisfied-by', to: 'req:far', generated: true },
    ] as GraphEdge[],
  } satisfies Pick<GraphData, 'nodes' | 'edges'>;
  const idx = { byId: new Map(g.nodes.map(n => [n.id, n])) };

  it('draws the map\'s own cards, the references that resolve, and the edges between them', () => {
    const spots = [{ id: 'req:a', x: 0, y: 0, ref: false }, { id: 'req:far', x: 300, y: 0, ref: true }, { id: 'req:gone', x: 9, y: 9, ref: true }];
    const m = mapGraph(g, idx, FILE, 'map:auth', spots);
    // the map's own nodes — never the page itself, never its blocks — plus the reference; the missing one is left out
    expect(m.nodes.map(n => n.id).sort()).toEqual(['decision:b', 'req:a', 'req:far']);
    expect(m.nodes.find(n => n.id === 'req:far')!.ref).toBe(true);
    // a card with no position yet is still drawn: the canvas places it
    expect(Number.isNaN(m.nodes.find(n => n.id === 'decision:b')!.x)).toBe(true);
    // no generated edge, no self link, nothing pointing off the map
    expect(m.edges.map(e => `${e.from}|${e.verb}|${e.to}`)).toEqual(['req:a|part-of|decision:b', 'req:a|refines|req:far', 'req:a|mentions|req:gone'].filter(x => !x.includes('gone')));
  });
});

describe('the verbs an edge may take', () => {
  const types: TypeDef[] = [{ id: 'type:req', slug: 'req', extends: null, chain: [], open: true, purpose: '', home: '', file: '', line: 1, props: [
    { name: 'satisfied-by', from: 'type:req', type: 'list of node', ref: 'node', many: true, required: false, inverse: 'satisfies', enum: null },
    { name: 'refines', from: 'type:req', type: 'list of req', ref: 'req', many: true, required: false, inverse: 'refined-by', enum: null },
    { name: 'title', from: 'type:node', type: 'string', ref: null, many: false, required: false, inverse: null, enum: null },
  ] }];
  it('offers what the ontology declares for that pair, and related-to always', () => {
    expect(verbsFor(types, 'req', 'req')).toEqual(['satisfied-by', 'refines', 'related-to']);
    expect(verbsFor(types, 'req', 'decision')).toEqual(['satisfied-by', 'related-to']);   // satisfied-by takes any node
    expect(verbsFor(types, 'goal', 'req')).toEqual(['related-to']);                        // a kind the ontology says nothing about
    expect(verbsFor(undefined, 'req', 'req')).toEqual(['related-to']);
  });
});

describe('a link on a card', () => {
  it('is written, joins a list, is never written twice, and comes off again', () => {
    expect(withLink('id: req:a\ntitle: A', 'refines', 'req:b')).toBe('id: req:a\ntitle: A\nrefines: req:b');
    expect(withLink('id: req:a\nrefines: req:b', 'refines', 'req:c')).toBe('id: req:a\nrefines: [req:b, req:c]');
    expect(withLink('id: req:a\nrefines: [req:b, req:c]', 'refines', 'req:b')).toBe('id: req:a\nrefines: [req:b, req:c]');
    expect(withoutLink('id: req:a\nrefines: [req:b, req:c]', 'refines', 'req:b')).toBe('id: req:a\nrefines: req:c');
    expect(withoutLink('id: req:a\nrefines: req:b\ntitle: A', 'refines', 'req:b')).toBe('id: req:a\ntitle: A');
    expect(withoutLink('id: req:a\ntitle: A', 'refines', 'req:b')).toBe('id: req:a\ntitle: A');
  });
  it('keeps the indentation of a card as it sits on the page', () => {
    expect(withLink('- id: req:a\n  title: A', 'refines', 'req:b')).toBe('- id: req:a\n  title: A\n  refines: req:b');
    expect(withLink('- id: req:a', 'part-of', 'goal:x')).toBe('- id: req:a\n  part-of: goal:x');
    expect(withLink('- id: req:a\n  refines: req:b', 'refines', 'req:c')).toBe('- id: req:a\n  refines: [req:b, req:c]');
    expect(withoutLink('- id: req:a\n  refines: req:b\n  title: A', 'refines', 'req:b')).toBe('- id: req:a\n  title: A');
  });
});
