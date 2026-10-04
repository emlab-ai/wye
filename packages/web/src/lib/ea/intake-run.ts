// Intake, the IO part (task:ea.cli-intake): the plan ea/intake makes, written — people, the meeting and the item cards
// as rows of their types' collection documents (lib/instance-add, decision:ontology.collection-document), updates under
// their project and questions under the meeting as content (node-content, under the file lock), an inbox item per
// question, one rebuild at the end. Writes go only into the product named (constraint:ea.reads-other-products-only).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope, mainProject } from '../scope';
import { addInstance } from '../instance-add';
import { typeBySlug } from '../types';
import { REPO_ROOT } from '../products';
import { readContent, writeContent } from '../node-content';
import { rebuild, withFileLock, writeAtomic } from '../write';
import { claimWrite } from '../changes';
import { addInboxItem, listInboxItems } from '../inbox';
import { cardValue } from '../hooks';
import { readModel, idPrefix } from './read';
import { planIntake, validateIntake, type IntakeSummary, type PlannedCard, type PlannedLine } from './intake';
import { validateMessages, planMessages } from './messages';
import { editNode } from '../node-edit';

export type IntakeResult = { ok: true; summary: IntakeSummary } | { ok: false; status: number; error: string; message: string; errors?: string[] };
export const EA_TYPES = ['person', 'project', 'commitment', 'meeting', 'risk'];

// A push carries a meeting analysis, Slack threads and emails waiting on the director (`messages`), or both.
export async function runIntake(product: string, raw: unknown, opts: { project?: string } = {}): Promise<IntakeResult> {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const hasMeeting = o.meeting !== undefined || o.items !== undefined;
  if (o.messages === undefined || hasMeeting) {
    const r = await runMeeting(product, raw, opts);
    if (!r.ok || o.messages === undefined) return r;
    const m = await runMessages(product, o.messages, opts); if (!m.ok) return m;
    return { ok: true, summary: { ...r.summary, messages: m.messages } };
  }
  const m = await runMessages(product, o.messages, opts); if (!m.ok) return m;
  return { ok: true, summary: { meeting: '', meetingCreated: false, created: [], updates: [], questions: [], inbox: [], skipped: [], notes: [], messages: m.messages } };
}

// Threads and emails: a new one is a card in its collection page (threads, emails), one pushed before — the same
// tool id — has its card updated: when it last moved, what it waits for, answered or not.
export async function runMessages(product: string, raw: unknown, opts: { project?: string } = {}): Promise<{ ok: true; messages: NonNullable<IntakeSummary['messages']> } | Extract<IntakeResult, { ok: false }>> {
  const v = validateMessages(raw);
  if (!v.ok) return { ok: false, status: 422, error: 'invalid', message: v.errors.join('\n'), errors: v.errors };
  let scope = await loadScope(product); if (!scope) return { ok: false, status: 404, error: 'not_found', message: `no product ${product}` };
  const missing = ['thread', 'email'].filter(t => !typeBySlug(scope!.graph, t));
  if (missing.length) return { ok: false, status: 422, error: 'invalid', message: `${product} does not declare ${missing.map(t => `type:${t}`).join(', ')} — open Settings › Packages (or GET /api/${product}/packages) so the executive-assistant package declares its new types` };
  const project = (opts.project ? scope.projects.find(p => p.slug === opts.project) : mainProject(scope));
  if (!project) return { ok: false, status: 404, error: 'not_found', message: `no project ${opts.project ?? ''} in ${product}` };
  const model = await readModel(scope);
  const defined = scope.graph.nodes.filter(n => n.defined);
  const bySource = new Map(defined.filter(n => n.kind === 'thread' || n.kind === 'email').map(n => [`${n.kind}|${cardValue(n.body, 'source-id').trim()}`, n.id]));
  const plan = planMessages(model, v.messages, idPrefix(scope), bySource, new Set(defined.map(n => n.id)));
  const out = { created: [] as string[], updated: [] as string[], answered: [] as string[], notes: plan.flatMap(p => p.notes.map(n => `${p.id}: ${n}`)) };
  for (const p of plan.filter(x => !x.exists)) {
    const r = await addInstance(scope, p.kind, { slug: p.id.slice(p.id.indexOf(':') + 1), title: p.title, props: p.props, status: p.status, home: `${project.slug}/${p.kind}s`, rebuild: false });
    if (!r.ok) return { ok: false, status: 422, error: 'invalid', message: `${p.id}: ${r.message}` };
    claimWrite(p.id, { by: 'agent:intake' }); out.created.push(p.id); if (p.status === 'done') out.answered.push(p.id);
  }
  if (out.created.length) { await rebuild(scope.product.dir); scope = (await loadScope(product))!; }
  for (const p of plan.filter(x => x.exists)) {
    claimWrite(p.id, { by: 'agent:intake' });
    const r = await editNode(scope, p.id, { status: p.status, props: p.props });
    if (!r.ok) return { ok: false, status: 422, error: 'invalid', message: `${p.id}: ${r.message}` };
    out.updated.push(p.id); if (p.status === 'done') out.answered.push(p.id);
  }
  return { ok: true, messages: out };
}

async function runMeeting(product: string, raw: unknown, opts: { project?: string } = {}): Promise<IntakeResult> {
  const v = validateIntake(raw);
  if (!v.ok) return { ok: false, status: 422, error: 'invalid', message: v.errors.join('\n'), errors: v.errors };
  let scope = await loadScope(product); if (!scope) return { ok: false, status: 404, error: 'not_found', message: `no product ${product}` };
  const missing = EA_TYPES.filter(t => !typeBySlug(scope!.graph, t));
  if (missing.length) return { ok: false, status: 422, error: 'invalid', message: `${product} does not declare ${missing.map(t => `type:${t}`).join(', ')} — install the executive-assistant package first` };
  const project = (opts.project ? scope.projects.find(p => p.slug === opts.project) : mainProject(scope));
  if (!project) return { ok: false, status: 404, error: 'not_found', message: `no project ${opts.project ?? ''} in ${product}` };
  const model = await readModel(scope);
  const defined = scope.graph.nodes.filter(n => n.defined);
  const existing = { ids: new Set(defined.map(n => n.id)), from: new Map(defined.map(n => [n.id, cardValue(n.body, 'from').trim()])) };
  const plan = planIntake(model, v.input, idPrefix(scope), existing);
  const by = plan.meeting.props.by;
  const summary: IntakeSummary = { meeting: plan.meeting.id, meetingCreated: !plan.meeting.exists, created: [], updates: [], questions: [], inbox: [], skipped: plan.skipped, notes: plan.notes };

  const add = async (c: PlannedCard) => {
    const r = await addInstance(scope!, c.kind, { slug: c.id.slice(c.id.indexOf(':') + 1), title: c.title, props: c.props, status: c.status, home: `${project.slug}/${c.kind}s`, rebuild: false });
    if (!r.ok) throw new Error(`${c.id}: ${r.message}`);
    claimWrite(c.id, { by }); summary.created.push(c.id);
  };
  for (const c of plan.people) await add(c);
  if (!plan.meeting.exists) await add(plan.meeting);
  for (const c of plan.cards) await add(c);
  if (summary.created.length) { await rebuild(scope.product.dir); scope = (await loadScope(product))!; }

  // updates under their project, questions under the meeting: a line whose id is already there is not written again
  const lines: PlannedLine[] = [...plan.updates, ...plan.questions];
  let wrote = false;
  for (const under of [...new Set(lines.map(l => l.under))]) {
    const node = scope.idx.byId.get(under);
    if (!node?.defined || !node.file) { summary.notes.push(`${under} is not in the graph — its lines were not written`); continue; }
    const file = path.join(REPO_ROOT, node.file);
    const added = await withFileLock(file, async () => {
      const md = await readFile(file, 'utf8');
      const cur = readContent(md, node.id, node.line, node.form ?? 'yaml'); if (cur === null) return [] as string[];
      const fresh = lines.filter(l => l.under === under && !new RegExp(`(^|\\s)${l.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'm').test(cur));
      if (!fresh.length) return [];
      claimWrite(node.id, { by });
      const next = writeContent(md, node.id, node.line, node.form ?? 'yaml', [cur.replace(/\s+$/, ''), ...fresh.map(l => l.line)].filter(Boolean).join('\n'));
      if (next === null || next === md) return [];
      await writeAtomic(file, next); return fresh.map(l => l.id);
    });
    if (added.length) wrote = true;
    for (const id of added) (id.startsWith('update:') ? summary.updates : summary.questions).push(id);
  }
  // the raw item waits in the inbox beside its question; one inbox item per question, however often it is pushed
  if (plan.questions.length) {
    const inbox = await listInboxItems(scope.product.dir);
    for (const q of plan.questions) {
      if (inbox.some(i => i.refs.includes(q.id))) continue;
      summary.inbox.push(await addInboxItem(scope.product.dir, { type: 'question', title: q.q, from: by, refs: [q.under, q.id, ...q.candidates], text: `From ${q.under}, not filed until the director says where it belongs.`, fields: { item: JSON.stringify(q.item) } }));
    }
  }
  if (wrote) await rebuild(scope.product.dir);
  return { ok: true, summary };
}
