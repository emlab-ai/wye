// A prose node line ("- [ ] task:x Text #status (k: v)") taken apart and put back together, so a single node can be
// edited in place without touching the rest of its document.
import { ID_RE, cleanId } from './ids';
import { EXTRA_GROUP, EXTRA_KEY, EXTRA_SPLIT } from './props';

// ready: the `#ready` mark on a task line — not a status (decision:exec.backlog-is-unassigned-work)
export interface NodeLine { prefix: string; check: '' | 'todo' | 'done'; id: string; text: string; status: string; extra: string; ready?: boolean }
const STATUS_TAG = /(?:^|\s)#(proposed|approved|shipped|unverified|api-only|deprecated|question|drift|done|in-progress|blocked|open|todo|review|non-goal|partial|active|draft|complete|on-track|at-risk|off-track|paused|resolved|rejected|superseded|retired|dismissed|defining|defined|building|cancelled|failed)\b/;
const READY_TAG = /(?:^|\s)#ready\b/;

export function parseNodeLine(line: string): NodeLine | null {
  // ID_RE has capture groups of its own, so the id is wrapped in a named group and the rest is read after it
  const m = line.match(new RegExp('^(?<prefix>\\s*(?:[-*+]|\\d+[.)])\\s+)?(?:\\[(?<box> |x|X)\\]\\s+)?(?<id>' + ID_RE.source + ')\\s+(?<rest>\\S.*)$'));
  if (!m || !m.groups) return null;
  const prefix = m.groups.prefix ?? ''; const box = m.groups.box; const id = cleanId(m.groups.id); let text = m.groups.rest;
  let extra = ''; const g = text.match(EXTRA_GROUP); if (g) { extra = g[1]; text = text.slice(0, g.index); }
  let status = ''; text = text.replace(STATUS_TAG, (_, st) => { status = st; return ''; }).trim();
  let ready = false; text = text.replace(READY_TAG, () => { ready = true; return ''; }).trim();
  const check: NodeLine['check'] = box === undefined ? '' : box === ' ' ? 'todo' : 'done';
  if (check && !status) status = check === 'done' ? 'done' : 'open';
  return { prefix, check, id, text, status, extra, ...(ready ? { ready: true } : {}) };
}

export function formatNodeLine(n: NodeLine): string {
  const implied = n.check === 'done' ? 'done' : n.check === 'todo' ? 'open' : '';
  const box = n.check === 'done' ? '[x] ' : n.check === 'todo' ? '[ ] ' : '';
  const status = n.status && n.status !== implied ? ' #' + n.status : '';
  return `${n.prefix}${box}${n.id} ${n.text.trim()}${status}${n.ready ? ' #ready' : ''}${n.extra ? ' (' + n.extra + ')' : ''}`;
}

// Apply a patch to the line: status (a task's checkbox follows it), text, and property keys (null removes).
export function patchNodeLine(line: string, patch: { status?: string; text?: string; props?: Record<string, string | null> }): string | null {
  const n = parseNodeLine(line); if (!n) return null;
  if (patch.status !== undefined) { n.status = patch.status; if (n.check || n.id.startsWith('task:')) n.check = patch.status === 'done' ? 'done' : 'todo'; }
  if (patch.text !== undefined && patch.text.trim()) n.text = patch.text.replace(/\s*\n\s*/g, ' ').trim();
  if (patch.props) {
    const m: Record<string, string> = {};
    for (const kv of n.extra.split(EXTRA_SPLIT)) { const mm = kv.match(new RegExp(`^\\s*(${EXTRA_KEY}):\\s*(.*?)\\s*$`)); if (mm && mm[2]) m[mm[1]] = mm[2]; }
    for (const [k, v] of Object.entries(patch.props)) { if (v === null || !String(v).trim()) delete m[k]; else m[k] = String(v).trim(); }
    // `ready` is the #ready mark on the line, never a key in the group
    if ('ready' in patch.props) { n.ready = !!patch.props.ready && !['false', 'no', 'off', '0'].includes(String(patch.props.ready).toLowerCase()); delete m.ready; }
    n.extra = Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(', ');
  }
  return formatNodeLine(n);
}
