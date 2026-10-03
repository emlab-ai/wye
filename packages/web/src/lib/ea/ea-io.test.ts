import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from '../products';
import { rebuild } from '../write';
import { loadScope } from '../scope';
import { editNode } from '../node-edit';
import { cardValue } from '../hooks';
import { listInboxItems } from '../inbox';
import { runIntake } from './intake-run';
import { applyCommitmentOp } from './commitments';
import { runBrief } from './brief-run';
import { readModel } from './read';
import { slipCount } from './model';

// Two scratch products: the assistant (zz-ea-*) with the package's kinds, and another product the director works in
// (zz-eaother-*) that the follow scan reads and must never write (constraint:ea.reads-other-products-only).
const TYPES = (p: string) => `---\nnode: module:${p}-kinds\ntitle: Kinds\n---\n\n# Kinds\n\n\`\`\`yaml
- id: type:person
  extends: type:node
  purpose: someone
  open: true
  props:
    name: string
    aliases: list of string?
- id: type:project
  extends: type:node
  purpose: an initiative
  open: true
  props:
    owner: ref person
    target: date?
    pace: string?
- id: type:commitment
  extends: type:node
  purpose: a dated promise
  open: true
  props:
    owner: ref person
    due: date
    state: string
    project: ref project?
    from: ref meeting?
    to: list of person?
    met-on: date?
    reason: string?
- id: type:meeting
  extends: type:node
  purpose: a meeting
  open: true
  props:
    date: date
    attendees: list of person?
    projects: list of project?
    source: string?
    type: string?
- id: type:risk
  extends: type:node
  purpose: a risk
  open: true
  props:
    owner: ref person?
    project: ref project
\`\`\`
`;
let ea: string, other: string, eaDir: string, otherDir: string;
const doc = (title: string, node: string, body: string) => `---\nnode: ${node}\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`;
const files = async (dir: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  const walk = async (d: string) => { for (const e of await readdir(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) await walk(f); else out[path.relative(dir, f)] = `${(await stat(f)).mtimeMs}:${await readFile(f, 'utf8')}`; } };
  await walk(dir); return out;
};
const brief = (kind: 'daily' | 'weekly' | '1on1', date: string, o: { write?: boolean; person?: string } = {}) => runBrief(ea, { kind, date, products: [other], ...o }).then(r => { if (!r.ok) throw new Error(r.message); return r; });
const node = async (id: string) => (await loadScope(ea))!.idx.byId.get(id)!;
const approve = async (id: string) => { const r = await editNode((await loadScope(ea))!, id, { status: 'approved' }); if (!r.ok) throw new Error(r.message); };
const analysis = (title: string, date: string, items: unknown[], o: Record<string, unknown> = {}) => ({ meeting: { title, date, attendees: ['Lee', 'Sam'], source: 'cowork', projects: ['Billing migration'], ...o }, items });

beforeAll(async () => {
  eaDir = await mkdtemp(path.join(DATA_ROOT, 'products', 'zz-ea-')); ea = path.basename(eaDir);
  otherDir = await mkdtemp(path.join(DATA_ROOT, 'products', 'zz-eaother-')); other = path.basename(otherDir);
  const d = path.join(eaDir, 'projects/assistant/docs'); await mkdir(d, { recursive: true });
  await writeFile(path.join(eaDir, '_product.md'), '---\ntitle: EA\ndirector: person:ea.alex\n---\n');
  await writeFile(path.join(d, 'kinds.md'), TYPES('ea'));
  await writeFile(path.join(d, 'people.md'), doc('People', 'module:people', '- person:ea.alex Alex (name: Alex, aliases: [malapheev, alex])\n- person:ea.lee Lee (name: Lee)\n- person:ea.dana Dana (name: Dana)'));
  await writeFile(path.join(d, 'projects.md'), doc('Projects', 'module:projects', '- project:ea.billing Billing migration #on-track (owner: person:ea.lee, pace: holding)\n- project:ea.search Search v2 #on-track (owner: person:ea.dana, pace: holding)\n- project:ea.infra Infra #on-track (owner: person:ea.lee, pace: holding)'));
  const o = path.join(otherDir, 'projects/core/docs'); await mkdir(o, { recursive: true });
  await writeFile(path.join(otherDir, '_product.md'), '---\ntitle: Other\n---\n');
  await writeFile(path.join(o, 'kinds.md'), TYPES('o'));
  await writeFile(path.join(o, 'plan.md'), doc('Plan', 'module:plan', [
    '- person:o.bo Bo (name: Bo)', '',
    '- [ ] task:o.review Review the rollout plan (owner: malapheev, related-to: [person:o.bo])',
    '- question:o.cache Which cache do we keep? @follow #open (owner: bo)',
    '- [x] task:o.closed An old task (owner: alex)',
    '- [ ] task:o.others Someone else\'s task (owner: bo)'].join('\n')));
  for (const dir of [eaDir, otherDir]) { const r = await rebuild(dir); if (r.code !== 0) throw new Error(r.output); }
}, 60_000);
afterAll(async () => { await rm(eaDir, { recursive: true, force: true }); await rm(otherDir, { recursive: true, force: true }); });

describe('the assistant end to end (scratch products)', () => {
  it('intake: the meeting and its items land proposed, linked to owner, project and people; a second push makes nothing (req:ea.meeting-lands-in-place)', async () => {
    const a = analysis('Platform sync', '2026-10-05', [
      { kind: 'commitment', text: 'Lee ships the cutover plan', owner: 'lee', due: '2026-10-06', people: ['Alex'] },
      { kind: 'decision', text: 'Freeze the old billing API', owner: 'Malapheev' },
      { kind: 'risk', text: 'Vendor sandbox is down', project: 'Search v2' },
      { kind: 'update', text: 'Rehearsal passed on staging' },
      { kind: 'commitment', text: 'Someone looks at it', owner: 'Dana', due: '2026-10-09', project: 'Payroll' }]);
    const r = await runIntake(ea, a); if (!r.ok) throw new Error(r.message);
    const m = 'meeting:ea.platform-sync-2026-10-05';
    expect(r.summary.meeting).toBe(m); expect(r.summary.meetingCreated).toBe(true);
    expect(r.summary.created).toEqual(['person:ea.sam', m, 'commitment:ea.lee-ships-the-cutover-plan', 'decision:ea.freeze-the-old-billing-api', 'risk:ea.vendor-sandbox-is-down']);
    expect(r.summary.updates).toEqual([`update:ea.platform-sync-2026-10-05-u4`]);
    expect(r.summary.questions).toEqual([`question:ea.platform-sync-2026-10-05-q5`]);
    expect(r.summary.inbox).toHaveLength(1);
    const c = await node('commitment:ea.lee-ships-the-cutover-plan');
    expect(c.status).toBe('proposed');
    expect(Object.fromEntries(['owner', 'due', 'state', 'project', 'from', 'to', 'by'].map(k => [k, cardValue(c.body, k)]))).toEqual({ owner: 'person:ea.lee', due: '2026-10-06', state: 'open', project: 'project:ea.billing', from: m, to: '[person:ea.alex]', by: 'agent:cowork' });
    expect((await node('person:ea.sam')).status).toBe('proposed');
    expect((await node(m)).status).toBe('proposed');
    expect(cardValue((await node(m)).body, 'attendees')).toBe('[person:ea.lee, person:ea.sam]');
    expect((await node('decision:ea.freeze-the-old-billing-api')).status).toBe('proposed');
    expect(cardValue((await node('decision:ea.freeze-the-old-billing-api')).body, 'owner')).toBe('person:ea.alex');
    const q = await node(`question:ea.platform-sync-2026-10-05-q5`);
    expect(q.status).toBe('open'); expect(q.title).toContain('Which project is "Someone looks at it" about?');
    const model = await readModel((await loadScope(ea))!);
    expect(model.projects.find(p => p.id === 'project:ea.billing')!.updates.map(u => [u.text, u.date, u.from])).toEqual([['Rehearsal passed on staging', '2026-10-05', m]]);
    const inbox = await listInboxItems(eaDir);
    expect(inbox[0].type).toBe('question'); expect(inbox[0].refs).toContain(m); expect(JSON.parse(inbox[0].fields.item).text).toBe('Someone looks at it');
    // the same analysis again: nothing new anywhere
    const before = await files(path.join(eaDir, 'projects'));
    const again = await runIntake(ea, a); if (!again.ok) throw new Error(again.message);
    expect(again.summary).toMatchObject({ meetingCreated: false, created: [], updates: [], questions: [], inbox: [] });
    expect(again.summary.skipped).toEqual(['commitment:ea.lee-ships-the-cutover-plan', 'decision:ea.freeze-the-old-billing-api', 'risk:ea.vendor-sandbox-is-down']);
    expect(await files(path.join(eaDir, 'projects'))).toEqual(before);
    expect(await listInboxItems(eaDir)).toHaveLength(1);
    const bad = await runIntake(ea, { meeting: { title: 'x' }, items: [] });
    expect(bad.ok).toBe(false); if (!bad.ok) expect(bad.message).toContain('meeting.date must be YYYY-MM-DD');
  }, 60_000);

  it('test:ea.proposed-commitment-stays-in-inbox — out of the brief until approved; an approved overdue one enters as late', async () => {
    const id = 'commitment:ea.lee-ships-the-cutover-plan';
    let md = (await brief('daily', '2026-10-05')).markdown;
    expect(md).not.toContain(id);
    await approve(id);
    md = (await brief('daily', '2026-10-05')).markdown;
    expect(md).toContain(`[Lee ships the cutover plan](${id}) — Lee · Billing migration · due 2026-10-06`);
    const r = await runIntake(ea, analysis('Late sync', '2026-10-01', [{ kind: 'commitment', text: 'Dana sends the numbers', owner: 'Dana', due: '2026-10-03' }]));
    if (!r.ok) throw new Error(r.message);
    expect((await brief('daily', '2026-10-05')).markdown).not.toContain('commitment:ea.dana-sends-the-numbers');
    await approve('commitment:ea.dana-sends-the-numbers');
    md = (await brief('daily', '2026-10-05')).markdown;
    expect(md.split('\n')[0]).toBe('1 late.');
    expect(md.indexOf('commitment:ea.dana-sends-the-numbers')).toBeGreaterThan(md.indexOf('## Late'));
    expect(md).toContain('due 2026-10-03 (2 days late)');
  }, 60_000);

  it('test:ea.commitment-kept-with-owner-project-date — a meeting, a message and a note each give one open commitment with owner, project, date and its source', async () => {
    const made: string[] = [];
    for (const [src, title] of [['cowork', 'Roadmap meeting'], ['slack', 'Message from Dana'], ['notes', 'Note to self']]) {
      const r = await runIntake(ea, { meeting: { title, date: '2026-10-04', attendees: ['Dana'], source: src }, items: [{ kind: 'commitment', text: `Dana delivers via ${src}`, owner: 'Dana', due: '2026-10-20', project: 'search-v2' }] });
      if (!r.ok) throw new Error(r.message);
      expect(r.summary.created.filter(x => x.startsWith('commitment:'))).toHaveLength(1);
      made.push(r.summary.created.find(x => x.startsWith('commitment:'))!);
    }
    const model = await readModel((await loadScope(ea))!);
    for (const [i, id] of made.entries()) {
      const c = model.commitments.find(x => x.id === id)!;
      expect([c.owner, c.project, c.due, c.state, c.status]).toEqual(['person:ea.dana', 'project:ea.search', '2026-10-20', 'open', 'proposed']);
      expect(c.from).toMatch(/^meeting:ea\./); expect((await node(c.from)).defined).toBe(true);
      expect(cardValue((await node(c.from)).body, 'source')).toBe(['cowork', 'slack', 'notes'][i]);
    }
  }, 60_000);

  it('test:ea.move-keeps-history, test:ea.project-slip-count, test:ea.met-leaves-briefs, test:ea.dropped-closed-with-reason — through the files', async () => {
    const id = 'commitment:ea.lee-ships-the-cutover-plan';
    expect(await applyCommitmentOp(ea, { op: 'move', id, to: '2026-10-09', why: '' })).toMatchObject({ ok: false, status: 422 });
    expect(await applyCommitmentOp(ea, { op: 'move', id, to: '2026-10-09', why: 'vendor slipped', on: '2026-10-05' })).toMatchObject({ ok: true });
    expect(await applyCommitmentOp(ea, { op: 'move', id, to: '2026-10-14', why: 'review took longer', on: '2026-10-07' })).toMatchObject({ ok: true });
    let model = await readModel((await loadScope(ea))!);
    const c = model.commitments.find(x => x.id === id)!;
    expect([c.due, c.state]).toEqual(['2026-10-14', 'moved']);
    expect(c.moves.map(m => [m.id, m.from, m.to, m.on, m.why])).toEqual([[`move:ea.lee-ships-the-cutover-plan-1`, '2026-10-06', '2026-10-09', '2026-10-05', 'vendor slipped'], [`move:ea.lee-ships-the-cutover-plan-2`, '2026-10-09', '2026-10-14', '2026-10-07', 'review took longer']]);
    expect(slipCount('project:ea.billing', model.commitments)).toBe(2);
    expect((await brief('daily', '2026-10-08')).markdown).toContain('due 2026-10-14');
    const weekly = (await brief('weekly', '2026-10-09')).markdown;
    expect(weekly).toContain('because vendor slipped'); expect(weekly).toContain('because review took longer'); expect(weekly).toContain('2 moves in all');
    expect(await applyCommitmentOp(ea, { op: 'met', id, on: '2026-10-08' })).toMatchObject({ ok: true });
    model = await readModel((await loadScope(ea))!);
    expect(model.commitments.find(x => x.id === id)!.metOn).toBe('2026-10-08');
    expect((await brief('daily', '2026-10-08')).markdown).not.toContain(id);
    const late = 'commitment:ea.dana-sends-the-numbers';
    expect(await applyCommitmentOp(ea, { op: 'drop', id: late, why: '' })).toMatchObject({ ok: false, message: 'dropping needs a reason: --why "…"' });
    expect(await applyCommitmentOp(ea, { op: 'drop', id: late, why: 'no longer needed' })).toMatchObject({ ok: true });
    expect(cardValue((await node(late)).body, 'reason')).toBe('no longer needed');
    for (const d of ['2026-10-08', '2026-10-30']) expect((await brief('daily', d)).markdown).not.toContain(late);
  }, 60_000);

  it('test:ea.brief-lists-replies-owed — the other product read, never written; a done task leaves the next brief', async () => {
    const before = await files(otherDir);
    const md = (await brief('daily', '2026-10-08')).markdown;
    const s = md.indexOf('## You owe a reply or a follow-up'); expect(s).toBeGreaterThan(0);
    expect(md).toContain(`[Review the rollout plan](/${other}/core/d/plan#n-task%3Ao.review) — ${other} › core · task (open) · yours · with [Bo](person:o.bo)`);
    expect(md).toContain(`[Which cache do we keep?](/${other}/core/d/plan#n-question%3Ao.cache) — ${other} › core · question (open) · @follow · with [Bo](person:o.bo)`);
    expect(md).not.toContain('task%3Ao.closed'); expect(md).not.toContain('task%3Ao.others');
    expect(await files(otherDir)).toEqual(before);   // constraint:ea.reads-other-products-only
    const r = await editNode((await loadScope(other))!, 'task:o.review', { status: 'done' }); if (!r.ok) throw new Error(r.message);
    expect((await brief('daily', '2026-10-09')).markdown).not.toContain('task%3Ao.review');
  }, 60_000);

  it('briefs written once a day, under Briefs; changed since yesterday from the snapshot (test:ea.brief-lists-projects-changed-since-yesterday)', async () => {
    const a = await brief('daily', '2026-10-10', { write: true });
    expect(a.doc).toBe(`${ea}/assistant/brief-2026-10-10`);
    const f = path.join(eaDir, 'projects/assistant/docs/brief-2026-10-10.md');
    const first = await readFile(f, 'utf8');
    expect(first).toMatch(/^part-of: module:briefs$/m); expect(first).toContain('# Daily brief — 2026-10-10');
    expect(await readFile(path.join(eaDir, 'projects/assistant/docs/briefs.md'), 'utf8')).toMatch(/^node: module:briefs$/m);
    await brief('daily', '2026-10-10', { write: true });
    expect((await readdir(path.join(eaDir, 'projects/assistant/docs'))).filter(n => n.startsWith('brief-'))).toEqual(['brief-2026-10-10.md']);
    expect(JSON.parse(await readFile(path.join(eaDir, '_ea/snapshots/2026-10-10.json'), 'utf8')).projects['project:ea.billing'].pace).toBe('holding');
    // since that brief: Billing slows down, a Search date moves, Infra stays
    await approve('commitment:ea.dana-delivers-via-slack');
    await brief('daily', '2026-10-10', { write: true });   // the snapshot now holds it at its first date
    const s = (await loadScope(ea))!; const e = await editNode(s, 'project:ea.billing', { props: { pace: 'slowing' } }); if (!e.ok) throw new Error(e.message);
    expect(await applyCommitmentOp(ea, { op: 'move', id: 'commitment:ea.dana-delivers-via-slack', to: '2026-10-27', why: 'waiting on legal', on: '2026-10-10' })).toMatchObject({ ok: true });
    const md = (await brief('daily', '2026-10-11', { write: true })).markdown;
    const ch = md.slice(md.indexOf('## Changed since yesterday'));
    expect(md.indexOf('## Changed since yesterday')).toBeGreaterThan(0);
    expect(ch).toContain('[Billing migration](project:ea.billing) — pace holding → slowing');
    expect(ch).toContain('due 2026-10-20 → 2026-10-27 because waiting on legal');
    expect(ch).not.toContain('Infra');
    expect((await brief('daily', '2026-10-12')).markdown).not.toContain('## Changed since yesterday');   // reported once
    const one = await brief('1on1', '2026-10-12', { write: true, person: 'person:ea.dana' });
    expect(one.doc).toBe(`${ea}/assistant/1on1-dana-2026-10-12`);
    expect(one.markdown).toContain('## Dana owes');
  }, 60_000);
});
