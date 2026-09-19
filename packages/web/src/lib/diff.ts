// A word-level diff for the change card (req:exec.change-kept): the old and new text as runs of equal, removed and
// added words — the classic LCS over word tokens, small inputs only (a block's text).
export type DiffRun = { kind: 'same' | 'del' | 'add'; text: string };
const tokens = (s: string) => s.split(/(\s+)/).filter(t => t.length);
export function wordDiff(a: string, b: string): DiffRun[] {
  const x = tokens(a), y = tokens(b);
  if (x.length * y.length > 250_000) return [{ kind: 'del', text: a }, { kind: 'add', text: b }]; // too big to be worth it
  const n = x.length, m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffRun[] = [];
  const push = (kind: DiffRun['kind'], text: string) => { const last = out[out.length - 1]; if (last && last.kind === kind) last.text += text; else out.push({ kind, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { push('same', x[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push('del', x[i]); i++; }
    else { push('add', y[j]); j++; }
  }
  while (i < n) { push('del', x[i]); i++; }
  while (j < m) { push('add', y[j]); j++; }
  return out;
}
