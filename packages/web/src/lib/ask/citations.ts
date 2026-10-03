// One numbering for both answers (decision:wf2.ask-two-lanes): [3] is the same source in the fast and the deep answer.
import type { Citation, Hit } from './types';

export class Citations {
  private list: Citation[] = []; private refs = new Map<string, Citation>();
  add(c: Omit<Citation, 'n'>): Citation { const have = this.refs.get(c.ref); if (have) return have; const x = { ...c, n: this.list.length + 1 }; this.list.push(x); this.refs.set(c.ref, x); return x; }
  get(n: number) { return this.list[n - 1]; }
  byRef(ref: string) { return this.refs.get(ref); }
  all() { return [...this.list]; }
}
export const citationOf = (h: Hit): Omit<Citation, 'n'> => ({ ref: h.ref, source: h.source, title: h.title, href: h.href, snippet: h.text.replace(/\s+/g, ' ').slice(0, 200) });
export function citedNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) for (const n of m[1].split(',').map(x => Number(x.trim()))) if (!out.includes(n)) out.push(n);
  return out;
}
