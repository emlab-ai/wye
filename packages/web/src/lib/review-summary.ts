// What a reviewer needs on the surface of an Inbox card, and what goes under "details" (rule:review-readable,
// req:exec.review-readable): a title, one description that is enough to understand the block or the edit, the
// things that need a decision (open conflicts, impact that asks for action), who and when — nothing else.
// Everything here is pure so the cards stay simple and the choices are tested.
import type { ImpactSet, ImpactVerdict } from './impact-run';
import type { ItemVerdict } from './review';

export const plainText = (t: string) => (t || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const trimDot = (t: string) => t.replace(/[.;,\s]+$/, '');

// The one description of a block, by kind: a requirement reads as its behaviour, a decision as its choice, a
// question as its question, the rest as their statement or text. `secondary` is what the reviewer can open.
export function describeBlock(kind: string, text: string, fields: Record<string, string>): { description: string; secondary: [string, string][] } {
  const f = (k: string) => plainText(fields[k] || '');
  const used = new Set<string>();
  let description = '';
  if (kind === 'req' && (f('when') || f('then'))) {
    const parts: string[] = [];
    if (f('when')) { parts.push(`When ${trimDot(f('when'))}`); used.add('when'); }
    if (f('then')) { parts.push(`${parts.length ? 'then ' : ''}${trimDot(f('then'))}`); used.add('then'); }
    if (f('unless')) { parts.push(`unless ${trimDot(f('unless'))}`); used.add('unless'); }
    description = cap(parts.join(', ')) + '.';
  } else if (kind === 'decision' && f('choice')) { description = f('choice'); used.add('choice'); }
  else if (kind === 'question') { description = plainText(text); used.add('q'); }
  else description = plainText(text);
  const order = ['context', 'alternatives', 'consequences', 'when', 'then', 'unless', 'conflict', 'between', 'source', 'supersedes', 'evidence', 'by', 'date'];
  const secondary = order.filter(k => fields[k] && !used.has(k) && plainText(fields[k]) !== description).map(k => [k, plainText(fields[k])] as [string, string]);
  return { description, secondary };
}

// An edit, as segments a card renders: status as pills, a property as old → new, a text as a diff.
export type ChangeSegment = { key: string; label: string; kind: 'status' | 'prop' | 'text'; from: string; to: string };
export function changeSegments(c: { changed: string[]; before: { text: string; status?: string; props: Record<string, string> }; after: { text: string; status?: string; props: Record<string, string>; textKey?: string } }): ChangeSegment[] {
  return c.changed.map(k => k === 'status'
    ? { key: k, label: 'status', kind: 'status' as const, from: c.before.status || '—', to: c.after.status || '—' }
    : k === 'text'
      ? { key: k, label: c.after.textKey || 'text', kind: 'text' as const, from: c.before.text, to: c.after.text }
      : { key: k, label: k, kind: 'prop' as const, from: c.before.props[k] ?? '', to: c.after.props[k] ?? '' });
}

// The same edit in one sentence, for the row and for the summary line: "status proposed → shipped; verified-by: ui-test:x".
export function changeSentence(c: Parameters<typeof changeSegments>[0]): string {
  return changeSegments(c).map(s => s.kind === 'text' ? `${s.label} rewritten` : s.kind === 'status' ? `status ${s.from} → ${s.to}` : s.from ? `${s.label}: ${s.from} → ${s.to || '—'}` : `${s.label}: ${s.to}`).join('; ');
}

// Open conflicts need a decision and go on the surface; the rest of the verdicts is one muted line.
export function verdictSummary(verdicts: ItemVerdict[] | undefined, checked?: number, classifying?: boolean): { open: ItemVerdict[]; line: string } {
  const vs = verdicts ?? [];
  const open = vs.filter(v => (v.kind === 'contradicts' || v.kind === 'duplicate') && v.open);
  const rest = vs.filter(v => !open.includes(v));
  if (classifying && !vs.length) return { open, line: 'not yet checked against its neighbours' };
  const n = checked ?? vs.length;
  if (!n) return { open, line: '' };
  const refines = rest.filter(v => v.kind === 'refines').length;
  const resolved = rest.filter(v => v.kind === 'contradicts' || v.kind === 'duplicate').length;
  const bits = [`checked against ${n} neighbour${n === 1 ? '' : 's'}`];
  if (refines) bits.push(`refines ${refines}`);
  if (resolved) bits.push(`${resolved} conflict${resolved === 1 ? '' : 's'} resolved`);
  if (!open.length && !refines && !resolved) bits.push('consistent');
  return { open, line: bits.join(' · ') };
}

// The impact set in one line: what asks for action first, the rest as counts. `actionable` says whether the card
// should open the impact by default.
export function impactSummary(impact?: ImpactSet): { line: string; actionable: number; pending: number; total: number } {
  if (!impact) return { line: 'impact not computed', actionable: 0, pending: 0, total: 0 };
  const cs = impact.candidates;
  const count = (v: ImpactVerdict) => cs.filter(c => c.verdict === v && !c.outcome).length;
  const update = count('update'), rework = count('rework'), contradicts = count('contradicts'), ask = count('ask');
  const dealt = cs.filter(c => c.outcome).length;
  const pending = cs.filter(c => !c.verdict).length;
  const actionable = update + rework + contradicts + ask;
  const bits: string[] = [];
  if (contradicts) bits.push(`${contradicts} contradict${contradicts === 1 ? 's' : ''}`);
  if (update) bits.push(`${update} update${update === 1 ? '' : 's'} proposed`);
  if (rework) bits.push(`${rework} to rework`);
  if (ask) bits.push(`${ask} question${ask === 1 ? '' : 's'}`);
  if (dealt) bits.push(`${dealt} dealt with`);
  let line: string;
  if (!cs.length) line = 'reaches nothing';
  else if (impact.status === 'failed') line = `impact failed: ${impact.error ?? 'error'}`;
  else if (!bits.length) line = pending ? `${cs.length} reached · ${pending} not yet judged` : `${cs.length} reached, nothing needs a change`;
  else line = bits.join(', ') + (pending ? ` · ${pending} not yet judged` : '');
  if (impact.mode !== 'auto' && impact.status === 'candidates') line = `${cs.length} reached · not judged (impact ${impact.mode})`;
  return { line, actionable, pending, total: cs.length };
}
