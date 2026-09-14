export const KINDS = ['req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'action', 'gate', 'flag', 'test', 'ui-test', 'module', 'product', 'tool', 'setting', 'field', 'drift', 'question', 'decision'] as const;
export const ID_RE = new RegExp('\\b(' + KINDS.join('|') + '):([A-Za-z0-9_][A-Za-z0-9_./#\\-]*)', 'g');

export function cleanId(tok: string): string {
  let t = tok.replace(/[.,;:)\]]+$/, '');
  if (t.includes('|')) t = t.split('|')[0];
  if (/^(test|ui-test):/.test(t)) t = t.replace(/#.*$/, '');
  if (t.startsWith('setting:')) t = 'flag:' + t.slice(8);
  return t;
}
export function kindOf(id: string): string { return id.split(':')[0]; }
export function idsIn(text: string): string[] {
  const out: string[] = []; let m: RegExpExecArray | null; ID_RE.lastIndex = 0;
  while ((m = ID_RE.exec(text))) out.push(cleanId(m[0]));
  return out;
}
