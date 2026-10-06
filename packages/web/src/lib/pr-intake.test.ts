import { describe, it, expect } from 'vitest';
import { intakePrompt, parseIntake, contextBody, contextText, impactBody, inForceOf, wordsOf, withSection, withTitle, READING, IN_FORCE_SHOWN, IMPACT_FAR, type Found } from './pr-intake';

// intake (decision:wf2.pr-intake): the prompt carries the request, the knowledge near it and the packet; the answer
// is parsed leniently; the sections are written in place
describe('pr intake', () => {
  it('lists what is already there one note per line, not as one run-on paragraph', () => {
    const ctx = contextBody({ title: 't', want: 'W.', touches: [], notes: ['goal:g restates the request', 'skill:plan exists but does not match'] }, [], [], '');
    // a note that opens with an id is led in: the line would otherwise define that node on the request's page
    expect(ctx).toContain('**Already there / in the way**\n- Note — goal:g restates the request\n- Note — skill:plan exists but does not match');
  });
  it('prompts with the request, the near knowledge and the packet, and parses the answer leniently', () => {
    const p = intakePrompt('make cities a document', [{ id: 'type:city', text: 'a city' }], '- rule:x — always');
    expect(p).toContain('## The request\nmake cities a document'); expect(p).toContain('- type:city: a city'); expect(p).toContain('- rule:x — always');
    const it = parseIntake('Sure:\n{"title": "Instances get a home document.", "want": "You want…", "touches": ["type:city", 42], "notes": ["rule:x covers half"]}', 'fallback');
    expect(it).toEqual({ title: 'Instances get a home document', want: 'You want…', touches: ['type:city'], notes: ['rule:x covers half'] });
    expect(parseIntake('garbage', 'fallback')).toEqual({ title: 'fallback', want: '', touches: [], notes: [] });
  });
  const F = (id: string, text: string, doc: string): Found => ({ id, kind: id.split(':')[0], text, doc });
  it('Context: what it touches is a list by page, each node in its own words — never a run of bare tags', () => {
    const ctx = contextBody({ title: 't', want: 'W.', touches: [], notes: ['rule:x covers half'] }, [F('type:city', 'A city a person can visit', 'ontology'), F('req:a', 'req:a — When a person opens a folder, its vaults are listed.', 'prd'), F('req:b', 'B', 'prd')], [], '_from: module:m_', d => d === 'prd' ? 'Product requirements' : d);
    expect(ctx).toContain('**What you want** — W.');
    expect(ctx).toContain('- On ontology\n  - Type · A city a person can visit (type:city)\n- On Product requirements\n  - Requirement · When a person opens a folder, its vaults are listed. (req:a)\n  - Requirement · B (req:b)');
    expect(ctx).toContain('**Already there / in the way**\n- Note — rule:x covers half'); expect(ctx.endsWith('_from: module:m_')).toBe(true);
    // no line opens with an id: such a line would define or embed the node on the request's page
    for (const l of ctx.split('\n')) expect(l).not.toMatch(/^\s*(?:[-*]\s+)?[a-z-]+:[A-Za-z0-9_.-]+\s/);
    expect(contextBody({ title: 't', want: '', touches: [], notes: [] }, [], [], '')).toContain('nothing in the product');
  });
  it('Context: what is in force is the nodes\' own cards — embed lines — with the rest counted', () => {
    const many = Array.from({ length: IN_FORCE_SHOWN + 3 }, (_, i) => F(`rule:r${i}`, 'always', 'rules'));
    const ctx = contextBody({ title: 't', want: '', touches: [], notes: [] }, [], many, '');
    expect(ctx).toContain('**In force** — the constraints, rules and decisions that govern it:\n\n![[rule:r0]]\n\n![[rule:r1]]');
    expect(ctx.match(/!\[\[/g)).toHaveLength(IN_FORCE_SHOWN); expect(ctx).toContain('… and 3 more');
    expect(contextBody({ title: 't', want: '', touches: [], notes: [] }, [], [], '')).toContain('**In force** — nothing governs this yet.');
  });
  it('in force: what the request touches first, then the other constraints, then the rest by how near it is', () => {
    const N = (id: string) => ({ id, kind: id.split(':')[0], title: id, status: 'approved', section: '', subsection: '', body: '', defined: true, file: 'docs/x.md', line: 1 });
    const byKind = { constraint: [N('constraint:c'), N('constraint:touched')], rule: [N('rule:a-far'), N('rule:z-near')], decision: [N('decision:touched')] };
    const hops = new Map([['constraint:c', 2], ['rule:a-far', 2], ['rule:z-near', 1], ['decision:touched', 0], ['constraint:touched', 0]]);
    expect(inForceOf(byKind, hops, ['req:x', 'decision:touched', 'constraint:touched']).map(n => n.id)).toEqual(['decision:touched', 'constraint:touched', 'constraint:c', 'rule:z-near', 'rule:a-far']);
  });
  it('a node is said in its text, led by its title only when the text does not open with it', () => {
    const N = (title: string, body: string) => ({ id: 'constraint:x', kind: 'constraint', title, status: '', section: '', subsection: '', body, defined: true, file: 'docs/x.md', line: 1 });
    expect(wordsOf(N('Text files in git are canonical:', 'text: Text files in git are canonical: a product is its markdown.'))).toBe('Text files in git are canonical: a product is its markdown.');
    expect(wordsOf(N('Products are folders', 'choice: one folder each, in git'))).toBe('Products are folders — one folder each, in git');
    expect(wordsOf(N('Only a title', ''))).toBe('Only a title');
  });
  it('what it touches that governs it is not said twice: no Touches paragraph when In force has it all', () => {
    const ctx = contextBody({ title: 't', want: 'W.', touches: [], notes: [] }, [], [F('decision:d', 'chose', 'x')], '');
    expect(ctx).not.toContain('**Touches**'); expect(ctx).toContain('![[decision:d]]');
  });
  it('Impact: each reached node in its own words under what it is reached from; a node\'s own content is not impact', () => {
    const find = (id: string) => ({ 'req:z': F('req:z', 'Products are kept one folder each', 'prd'), 'decision:d': F('decision:d', 'A product is a data folder', 'storage') } as Record<string, Found>)[id];
    const out = impactBody([{ id: 'req:z', from: 'decision:d', weight: 0.8, path: ['governs'], via: 'structure' }, { id: 'req:z', from: 'type:city', weight: 0.6, path: ['refined-by'] }, { id: 'choice:d', from: 'decision:d', weight: 1, path: ['content'], via: 'content' }], find);
    expect(out).toContain('- Because it touches A product is a data folder (decision:d)\n  - Requirement · Products are kept one folder each (req:z) — it governs this');
    // what is further than one step is a few and a count, not a wall
    const far = Array.from({ length: IMPACT_FAR + 4 }, (_, i) => ({ id: `req:f${i}`, from: 'decision:d', weight: 0.6, path: 'governs → refined-by' }));
    const wall = impactBody([{ id: 'req:z', from: 'decision:d', weight: 0.8, path: 'governs' }, ...far], find);
    expect(wall.match(/through governs › refined-by/g)).toHaveLength(IMPACT_FAR); expect(wall).toContain('… and 4 more further away');
    expect(out).not.toContain('choice:d'); expect(out).not.toContain('0.8');
    for (const l of out.split('\n')) expect(l).not.toMatch(/^\s*(?:[-*]\s+)?[a-z-]+:[A-Za-z0-9_.-]+\s/);
    expect(impactBody([{ id: 'choice:d', from: 'decision:d', weight: 1, path: ['content'], via: 'content' }], find)).toContain('Nothing reached yet');
    expect(impactBody([])).toContain('Nothing reached yet');
  });
  it('the librarian gets the same as plain lines: ids and words, no cards', () => {
    const t = contextText({ title: 't', want: 'W.', touches: [], notes: [] }, [F('req:a', 'A', 'prd')], [F('rule:x', 'always', 'rules')]);
    expect(t).toContain('- req:a (prd) — A'); expect(t).toContain('**In force**\n- rule:x — always'); expect(t).not.toContain('![[');
  });
  it('replaces a section body in place and the title in both places', () => {
    const md = '---\nnode: pr:3\ntitle: old\n---\n\n# old\n\n## Request\n\n> r\n\n## Context\n\n_placeholder_\n\n## Impact\n\n_placeholder_\n\n## Tasks\n\n- [ ] task:pr-3 old #todo\n';
    const out = withSection(withSection(withTitle(md, 'New title'), 'Context', READING), 'Impact', '- req:z — 0.9 from req:a');
    expect(out).toContain('title: New title\n---\n\n# New title\n'); expect(out).toContain('## Context\n\n' + READING + '\n\n## Impact\n\n- req:z — 0.9 from req:a\n\n## Tasks');
    expect(out).not.toContain('_placeholder_');
  });
});
