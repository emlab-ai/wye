// A node's verdict lines kept current (decision:memory.write-time-verdict): one verdict per pair — a new judgement of a
// pair (its text changed, so the pair is judged again) replaces the old line instead of piling up beside it; an open
// contradiction of a pair that no longer conflicts is closed (#resolved, saying what it is now); one that still
// conflicts gives way to the new one. A contradiction the person settled (dismissed, resolved, …) is theirs and stays.
export type PairVerdict = { key: string; kind: string; a: string; b: string };

const pairOf = (block: string): string | null => {
  const m = block.match(/\(.*?\b(?:pair|between): ([^\s,)]+) ([^\s,)]+)/);
  return m ? [m[1], m[2]].sort().join('|') : null;
};
const isVerdict = (b: string) => /^\s*verdict:/.test(b);
const isContradiction = (b: string) => /^\s*contradiction:/.test(b);
const keyOf = (b: string) => b.match(/^\s*(?:verdict:|contradiction:[^.\s]+\.)(\w+)/)?.[1] ?? null;

export function reconcileVerdicts(content: string, vs: PairVerdict[], linesOf: (v: PairVerdict) => string[]): { content: string; changed: boolean; added: number } {
  let blocks = content.trim() ? content.trim().split(/\n\s*\n/) : [];
  const before = blocks.join('\n\n'); let added = 0;
  for (const v of vs) {
    const pair = [v.a, v.b].sort().join('|'); const conflict = v.kind === 'contradicts' || v.kind === 'duplicate';
    blocks = blocks.flatMap(b => {
      if (pairOf(b) !== pair || keyOf(b) === v.key) return [b];
      if (isVerdict(b)) return [];                                        // the pair's older verdict
      if (isContradiction(b) && /#open\b/.test(b)) return conflict ? [] : [b.replace(/#open\b/, `#resolved — judged again: now ${v.kind}`)];
      return [b];
    });
    if (v.kind === 'consistent') continue;
    for (const l of linesOf(v)) if (!blocks.some(b => b.split(' ')[0].trim() === l.split(' ')[0])) { blocks.push(l); added++; }
  }
  const next = blocks.join('\n\n');
  return { content: next === before ? content : next, changed: next !== before, added };
}
