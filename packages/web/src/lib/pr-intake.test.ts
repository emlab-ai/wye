import { describe, it, expect } from 'vitest';
import { intakePrompt, parseIntake, contextBody, impactBody, withSection, withTitle, READING } from './pr-intake';

// intake (decision:wf2.pr-intake): the prompt carries the request, the knowledge near it and the packet; the answer
// is parsed leniently; the sections are written in place
describe('pr intake', () => {
  it('prompts with the request, the near knowledge and the packet, and parses the answer leniently', () => {
    const p = intakePrompt('make cities a document', [{ id: 'type:city', text: 'a city' }], '- rule:x — always');
    expect(p).toContain('## The request\nmake cities a document'); expect(p).toContain('- type:city: a city'); expect(p).toContain('- rule:x — always');
    const it = parseIntake('Sure:\n{"title": "Instances get a home document.", "want": "You want…", "touches": ["type:city", 42], "notes": ["rule:x covers half"]}', 'fallback');
    expect(it).toEqual({ title: 'Instances get a home document', want: 'You want…', touches: ['type:city'], notes: ['rule:x covers half'] });
    expect(parseIntake('garbage', 'fallback')).toEqual({ title: 'fallback', want: '', touches: [], notes: [] });
  });
  it('writes Context and Impact bodies', () => {
    const ctx = contextBody({ title: 't', want: 'W.', touches: [], notes: ['rule:x covers half'] }, [{ id: 'type:city', doc: 'ontology' }, { id: 'req:a', doc: 'prd' }, { id: 'req:b', doc: 'prd' }], '## Constraints\n- rule:x [approved] — always\n- decision:y — chose\n- question:q — open?', '_from: module:m_');
    expect(ctx).toContain('**What you want** — W.'); expect(ctx).toContain('**Touches** — ontology: type:city · prd: req:a, req:b'); expect(ctx).toContain('**Already there / in the way** — rule:x covers half'); expect(ctx).toContain('**In force** — the constraints and decisions that govern it:\n- [approved] rule:x — always\n- decision:y — chose'); expect(ctx).not.toContain('question:q'); expect(ctx.endsWith('_from: module:m_')).toBe(true);
    expect(contextBody({ title: 't', want: '', touches: [], notes: [] }, [], '', '')).toContain('nothing in the product');
    expect(impactBody([{ id: 'req:z', from: 'type:city', weight: 0.6, path: 'refined-by' }, { id: 'req:z', from: 'req:a', weight: 0.9, path: '' }])).toBe('- req:z — 0.9 from req:a');
    expect(impactBody([])).toContain('Nothing reached yet');
  });
  it('replaces a section body in place and the title in both places', () => {
    const md = '---\nnode: pr:3\ntitle: old\n---\n\n# old\n\n## Request\n\n> r\n\n## Context\n\n_placeholder_\n\n## Impact\n\n_placeholder_\n\n## Tasks\n\n- [ ] task:pr-3 old #todo\n';
    const out = withSection(withSection(withTitle(md, 'New title'), 'Context', READING), 'Impact', '- req:z — 0.9 from req:a');
    expect(out).toContain('title: New title\n---\n\n# New title\n'); expect(out).toContain('## Context\n\n' + READING + '\n\n## Impact\n\n- req:z — 0.9 from req:a\n\n## Tasks');
    expect(out).not.toContain('_placeholder_');
  });
});
