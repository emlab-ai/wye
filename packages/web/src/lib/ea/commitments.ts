// Commitments (task:ea.commitment-tracking, req:ea.dates-followed): a date someone committed to is followed until it is
// met, moved or dropped. A move keeps the old date, the new one, when and why as a `move:` line under the commitment
// (test:ea.move-keeps-history) and sets due and state; met keeps the day it was met on (test:ea.met-leaves-briefs);
// drop keeps its reason and is refused without one (test:ea.dropped-closed-with-reason). The checks are pure
// (commitmentOp); the writes are node-content + node-edit under the file lock.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '../scope';
import { REPO_ROOT } from '../products';
import { readContent, writeContent } from '../node-content';
import { editNode } from '../node-edit';
import { withFileLock, writeAtomic } from '../write';
import { claimWrite } from '../changes';
import { toCommitment, isDate, today, type Move } from './model';
import { contentLines } from './read';

export type CommitmentOp = { op: 'move'; id: string; to: string; why: string; on?: string } | { op: 'met'; id: string; on?: string } | { op: 'drop'; id: string; why: string };
export type OpPlan = { ok: true; props: Record<string, string>; line?: string; move?: Move } | { ok: false; message: string };

// What an op does to a commitment as it stands: the props to set and, for a move, the history line to add.
export function commitmentOp(c: { id: string; due: string; state: string; moves: Move[] }, op: CommitmentOp, day = today()): OpPlan {
  const on = ('on' in op && op.on) || day;
  if (!isDate(on)) return { ok: false, message: `--on must be YYYY-MM-DD (got ${on})` };
  if (c.state === 'dropped' || c.state === 'met') return { ok: false, message: `${c.id} is ${c.state} already` };
  if (op.op === 'move') {
    if (!op.why?.trim()) return { ok: false, message: 'a move needs a reason: --why "…"' };
    if (!isDate(op.to)) return { ok: false, message: `--to must be YYYY-MM-DD (got ${op.to})` };
    if (op.to === c.due) return { ok: false, message: `${c.id} is due ${c.due} already` };
    const n = Math.max(0, ...c.moves.map(m => m.n)) + 1;
    const move: Move = { id: `move:${c.id.slice(c.id.indexOf(':') + 1)}-${n}`, n, from: c.due, to: op.to, on, why: op.why.replace(/\s+/g, ' ').trim() };
    return { ok: true, props: { due: op.to, state: 'moved' }, move, line: `- ${move.id} from ${move.from} to ${move.to} on ${move.on} because ${move.why}` };
  }
  if (op.op === 'met') return { ok: true, props: { state: 'met', 'met-on': on } };
  if (!op.why?.trim()) return { ok: false, message: 'dropping needs a reason: --why "…"' };
  return { ok: true, props: { state: 'dropped', reason: op.why.replace(/[()]/g, '').replace(/,(\s*[A-Za-z][\w-]*:)/g, ';$1').replace(/\s+/g, ' ').trim() } };
}

export async function applyCommitmentOp(product: string, op: CommitmentOp): Promise<{ ok: true; id: string; props: Record<string, string>; move?: Move } | { ok: false; status: number; message: string }> {
  const scope = await loadScope(product); if (!scope) return { ok: false, status: 404, message: `no product ${product}` };
  const node = scope.idx.byId.get(op.id);
  if (!node?.defined || node.kind !== 'commitment') return { ok: false, status: 404, message: `${op.id} is not a commitment in ${product}` };
  const c = toCommitment(node, await contentLines(node));
  const plan = commitmentOp(c, op);
  if (!plan.ok) return { ok: false, status: 422, message: plan.message };
  claimWrite(node.id, { by: 'person' });
  if (plan.line) {
    const file = path.join(REPO_ROOT, node.file);
    const ok = await withFileLock(file, async () => {
      const md = await readFile(file, 'utf8');
      const cur = readContent(md, node.id, node.line, node.form ?? 'yaml'); if (cur === null) return false;
      const next = writeContent(md, node.id, node.line, node.form ?? 'yaml', [cur.replace(/\s+$/, ''), plan.line].filter(Boolean).join('\n'));
      if (next === null) return false; await writeAtomic(file, next); return true;
    });
    if (!ok) return { ok: false, status: 422, message: `${op.id} has no place for content in its document` };
  }
  const r = await editNode(scope, op.id, { props: plan.props });
  if (!r.ok) return { ok: false, status: 422, message: r.message };
  return { ok: true, id: op.id, props: plan.props, ...(plan.move ? { move: plan.move } : {}) };
}
