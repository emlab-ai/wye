// `session` is here for the reader, not for the graph: sessions are files under _sessions, never nodes, but a
// `session:<id>` written anywhere — a run's step, a decision's evidence, a task — should be a tag that opens the
// conversation in the column (PeekPanel renders a session for that id). The parser's kinds come from the type cards
// and are untouched by this, so no session stub is ever added to the graph.
export const KINDS = ['req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'action', 'gate', 'flag', 'test', 'ui-test', 'module', 'product', 'task', 'goal', 'tool', 'setting', 'field', 'drift', 'question', 'decision', 'type', 'prop', 'block', 'session'] as const;
export const ALIASES: Record<string, string> = { et: 'entity', rq: 'req', rl: 'rule', pg: 'page', st: 'state', dc: 'decision', qn: 'question', vl: 'value', ac: 'action', gt: 'gate', fl: 'flag', tk: 'task', gl: 'goal' };
const idRegex = (kinds: readonly string[]) => new RegExp('\\b(' + [...kinds.map(k => k.replace(/-/g, '\\-')), ...Object.keys(ALIASES)].join('|') + '):([A-Za-z0-9_][A-Za-z0-9_./#\\-]*)', 'g');
// The kind list is open: a product's type: cards add kinds (graph.kinds). setKinds is called with the graph's kinds
// on the server (loadScope) and in the client provider, so every consumer of ID_RE sees the product's ids.
export let ID_RE = idRegex(KINDS);
export function setKinds(kinds: readonly string[] | undefined) { ID_RE = idRegex([...new Set([...KINDS, ...(kinds ?? [])])]); }

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
