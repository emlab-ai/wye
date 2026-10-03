import { describe, it, expect } from 'vitest';
import { askReducer, initialAsk } from './reducer';
import type { AskEvent, Citation } from './types';

const c = (n: number, ref: string): Citation => ({ n, ref, source: 'node', title: ref, href: null, snippet: '' });
describe('askReducer', () => {
  it('accumulates both answers, found sources and citations', () => {
    const evs: AskEvent[] = [
      { type: 'results', hits: [] }, { type: 'fast.delta', text: 'A [1]' }, { type: 'step', text: 'Searching' },
      { type: 'found', citation: c(2, 'lib/x.ts:1-9') }, { type: 'found', citation: c(2, 'lib/x.ts:1-9') },
      { type: 'fast.done', citations: [c(1, 'req:a')] }, { type: 'deep.delta', text: 'B [2]' }, { type: 'deep.done', citations: [c(2, 'lib/x.ts:1-9')], cut: true }, { type: 'done' },
    ];
    const s = evs.reduce(askReducer, initialAsk('q?'));
    expect(s).toMatchObject({ fast: 'A [1]', deep: 'B [2]', fastDone: true, deepDone: true, cut: true, done: true, step: '' });
    expect(s.found.map(f => f.n)).toEqual([2]);
    expect(Object.keys(s.cites)).toEqual(['1', '2']);
  });
  it('marks a thin fast answer and strips the marker', () => {
    const s = [{ type: 'fast.delta', text: 'Not in the sources.\nTHIN' }, { type: 'fast.done', citations: [] }].reduce((a, e) => askReducer(a, e as AskEvent), initialAsk('q'));
    expect(s.thin).toBe(true); expect(s.fast).toBe('Not in the sources.');
  });
  it('records lane errors', () => {
    const s = askReducer(initialAsk('q'), { type: 'error', lane: 'deep', message: 'boom' });
    expect(s.errors).toEqual([{ lane: 'deep', message: 'boom' }]);
  });
});
