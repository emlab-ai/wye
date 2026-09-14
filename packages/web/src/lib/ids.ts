export const KINDS = ['req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'action', 'gate', 'flag', 'test', 'ui-test', 'module', 'product', 'tool', 'setting', 'field', 'drift', 'question', 'decision'] as const;
export const ALIASES: Record<string, string> = { et: 'entity', rq: 'req', rl: 'rule', pg: 'page', st: 'state', dc: 'decision', qn: 'question', vl: 'value', ac: 'action', gt: 'gate', fl: 'flag' };
export const ID_RE = new RegExp('\\b(' + [...KINDS, ...Object.keys(ALIASES)].join('|') + '):([A-Za-z0-9_][A-Za-z0-9_./#\\-]*)', 'g');

export function cleanId(tok: string): string {
  let t = tok.replace(/[.,;:)\]]+$/, '');
  if (t.includes('|')) t = t.split('|')[0];
  if (/^(test|ui-test):/.test(t)) t = t.replace(/#.*$/, '');
  if (t.startsWith('setting:')) t = 'flag:' + t.slice(8);
  const k = t.split(':')[0]; if (ALIASES[k]) t = ALIASES[k] + t.slice(k.length);
  return t;
}
export function kindOf(id: string): string { return id.split(':')[0]; }
export function idsIn(text: string): string[] {
  const out: string[] = []; let m: RegExpExecArray | null; ID_RE.lastIndex = 0;
  while ((m = ID_RE.exec(text))) out.push(cleanId(m[0]));
  return out;
}
