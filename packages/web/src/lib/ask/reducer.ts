// The panel's view of one question: the stream of AskEvents folded into what it shows. Client-safe.
import type { AskEvent, Citation } from './types';

export type AskState = { q: string; fast: string; deep: string; fastDone: boolean; deepDone: boolean; cut: boolean; thin: boolean; step: string; found: Citation[]; cites: Record<number, Citation>; errors: { lane: string; message: string }[]; done: boolean };
export const initialAsk = (q: string): AskState => ({ q, fast: '', deep: '', fastDone: false, deepDone: false, cut: false, thin: false, step: '', found: [], cites: {}, errors: [], done: false });
const withCites = (s: AskState, cs: Citation[]) => { const cites = { ...s.cites }; for (const c of cs) cites[c.n] = c; return cites; };

export function askReducer(s: AskState, e: AskEvent): AskState {
  switch (e.type) {
    case 'fast.delta': return { ...s, fast: s.fast + e.text };
    case 'fast.done': { const thin = /\n?\s*THIN\s*$/.test(s.fast); return { ...s, fastDone: true, thin, fast: s.fast.replace(/\n?\s*THIN\s*$/, '').trim(), cites: withCites(s, e.citations) }; }
    case 'step': return { ...s, step: e.text };
    case 'found': return s.found.some(f => f.n === e.citation.n) ? s : { ...s, found: [...s.found, e.citation], cites: withCites(s, [e.citation]) };
    case 'deep.delta': return { ...s, deep: s.deep + e.text };
    case 'deep.done': return { ...s, deepDone: true, step: '', cut: !!e.cut, cites: withCites(s, e.citations) };
    case 'error': return { ...s, errors: [...s.errors, { lane: e.lane, message: e.message }], ...(e.lane === 'deep' ? { deepDone: true, step: '' } : e.lane === 'fast' ? { fastDone: true } : {}) };
    case 'done': return { ...s, done: true, step: '' };
    default: return s;
  }
}
