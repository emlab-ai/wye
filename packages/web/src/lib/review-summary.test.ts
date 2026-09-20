import { describe, it, expect } from 'vitest';
import { describeBlock, changeSegments, changeSentence, verdictSummary, impactSummary } from './review-summary';
import type { ImpactSet } from './impact-run';

describe('review-summary (rule:review-readable)', () => {
  it('a requirement reads as its behaviour; the rest is secondary', () => {
    const r = describeBlock('req', 'the state is explained', { when: 'the state is explained and the questions answered', then: 'it writes requirements.', unless: 'the request is already satisfied', context: 'why' });
    expect(r.description).toBe('When the state is explained and the questions answered, then it writes requirements, unless the request is already satisfied.');
    expect(r.secondary).toEqual([['context', 'why']]);
  });
  it('a decision reads as its choice; context, alternatives and consequences open on demand', () => {
    const r = describeBlock('decision', '', { context: 'c', choice: 'do **X**', alternatives: 'Y', consequences: 'Z', date: '2026-09-20' });
    expect(r.description).toBe('do X');
    expect(r.secondary.map(([k]) => k)).toEqual(['context', 'alternatives', 'consequences', 'date']);
  });
  it('a question is its question; a rule its statement; markdown is stripped', () => {
    expect(describeBlock('question', 'Is [this](x) *it*?', {}).description).toBe('Is this it?');
    expect(describeBlock('rule', 'never `rm`', { source: 'a.ts' }).description).toBe('never rm');
  });
  it('an edit is segments and one sentence', () => {
    const c = { changed: ['status', 'verified-by', 'text'], before: { text: 'old words', status: 'proposed', props: {} }, after: { text: 'new words', status: 'shipped', props: { 'verified-by': '[ui-test:ask-wye]' }, textKey: 'then' } };
    expect(changeSegments(c).map(s => s.kind)).toEqual(['status', 'prop', 'text']);
    expect(changeSentence(c)).toBe('status proposed → shipped; verified-by: [ui-test:ask-wye]; then rewritten');
  });
  it('open conflicts surface; consistent verdicts fold into one line', () => {
    const open = { kind: 'contradicts' as const, other: 'rule:x', reason: 'r', open: true };
    const v = verdictSummary([open, { kind: 'consistent', other: 'req:y', reason: '' }, { kind: 'refines', other: 'req:z', reason: '' }], 3);
    expect(v.open).toEqual([open]);
    expect(v.line).toBe('checked against 3 neighbours · refines 1');
    expect(verdictSummary([], 4).line).toBe('checked against 4 neighbours · consistent');
    expect(verdictSummary(undefined, 0, true).line).toBe('not yet checked against its neighbours');
  });
  it('impact is one line: what asks for action first, then the counts', () => {
    const cand = (id: string, verdict?: ImpactSet['candidates'][number]['verdict'], outcome?: 'applied') => ({ id, kind: 'req', title: id, path: 'refined-by', via: 'structure' as const, weight: 1, text: '', hash: '', verdict, outcome: outcome ? { state: outcome } : undefined });
    const set: ImpactSet = { at: '', status: 'running', mode: 'auto', pending: 2, candidates: [cand('a', 'update'), cand('b', 'rework'), cand('c', 'unaffected'), cand('d'), cand('e'), cand('f', 'update', 'applied')] };
    const s = impactSummary(set);
    expect(s.line).toBe('1 update proposed, 1 to rework, 1 dealt with · 2 not yet judged');
    expect(s.actionable).toBe(2);
    expect(impactSummary({ ...set, status: 'done', pending: 0, candidates: [cand('c', 'unaffected')] }).line).toBe('1 reached, nothing needs a change');
    expect(impactSummary({ ...set, status: 'candidates', mode: 'manual', candidates: [cand('c')] }).line).toBe('1 reached · not judged (impact manual)');
    expect(impactSummary(undefined).line).toBe('impact not computed');
  });
});
