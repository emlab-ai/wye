import { describe, it, expect } from 'vitest';
import { dailyBrief, weeklyReview, oneOnOne, snapshotOf, type BriefInput } from './briefs';
import { commitmentHistory, slipCount, type EaCommitment, type EaModel, type EaProject } from './model';
import { commitmentOp } from './commitments';
import { validateIntake, planIntake } from './intake';
import type { FollowItem } from './follow';

// fixtures: the director (alex), two people, two projects; commitments made per test
const D = '2026-10-05';
const person = (slug: string, name: string, aliases: string[] = []) => ({ id: `person:ea.${slug}`, title: name, name, role: '', aliases, reportsTo: '', status: 'approved' });
const project = (slug: string, title: string, o: Partial<EaProject> = {}): EaProject => ({ id: `project:ea.${slug}`, title, status: 'on-track', owner: 'person:ea.lee', target: '', pace: 'holding', people: [], updates: [], ...o });
const c = (slug: string, o: Partial<EaCommitment> = {}): EaCommitment => ({ id: `commitment:ea.${slug}`, title: slug.replace(/-/g, ' '), status: 'approved', owner: 'person:ea.lee', due: D, state: 'open', project: 'project:ea.billing', from: '', to: [], metOn: '', reason: '', moves: [], ...o });
const model = (o: Partial<EaModel> = {}): EaModel => ({ people: [person('alex', 'Alex', ['malapheev']), person('lee', 'Lee'), person('dana', 'Dana')], projects: [project('billing', 'Billing migration'), project('search', 'Search v2'), project('infra', 'Infra')], commitments: [], meetings: [], decisions: [], risks: [], ...o });
const input = (m: Partial<EaModel> = {}, o: Partial<BriefInput> = {}): BriefInput => ({ product: 'ea', director: 'person:ea.alex', model: model(m), follow: [], previous: null, ...o });
const follow = (o: Partial<FollowItem>): FollowItem => ({ product: 'wye', project: 'v2', doc: 'plan', link: '/wye/v2/d/plan#n-task%3Ax', id: 'task:x', kind: 'task', title: 'x', status: 'open', owner: 'alex', why: 'owner', people: [], ...o });
const at = (md: string, s: string) => { const i = md.indexOf(s); expect(i, `"${s}" in\n${md}`).toBeGreaterThanOrEqual(0); return i; };

describe('daily brief (req:ea.daily-brief)', () => {
  it('test:ea.brief-lists-due-and-slipping — late first, then due today, then later under its project; met never', () => {
    const md = dailyBrief(input({ commitments: [c('due-today'), c('passed-yesterday', { due: '2026-10-04' }), c('next-month', { due: '2026-11-05', project: 'project:ea.search' }), c('already-met', { state: 'met', metOn: '2026-10-01' })] }), D);
    expect(md.split('\n')[0]).toBe('1 late, 1 due today.');
    const late = at(md, '## Late'), today = at(md, '## Due today'), open = at(md, '## Open, by project');
    expect(at(md, '[passed yesterday](commitment:ea.passed-yesterday) — Lee · Billing migration · due 2026-10-04 (1 day late)')).toBeGreaterThan(late);
    expect(at(md, '[due today](commitment:ea.due-today) — Lee · Billing migration')).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(late);
    const sp = at(md, '### [Search v2](project:ea.search)');
    expect(sp).toBeGreaterThan(open);
    expect(at(md, '[next month](commitment:ea.next-month) — Lee · Search v2 · due 2026-11-05')).toBeGreaterThan(sp);
    expect(md).not.toContain('already met');
  });
  it('test:ea.approaching-date-in-brief — every open one from the day it is made, overdue, today, later; met leaves', () => {
    const cs = [c('in-three-weeks', { due: '2026-10-26' }), c('today'), c('two-days-over', { due: '2026-10-03' })];
    const md = dailyBrief(input({ commitments: cs }), D);
    const a = at(md, 'commitment:ea.two-days-over'), b = at(md, 'commitment:ea.today)'), l = at(md, 'commitment:ea.in-three-weeks');
    expect(a).toBeLessThan(b); expect(b).toBeLessThan(l);
    for (const x of cs) expect(md).toMatch(new RegExp(`\\(${x.id}\\) — Lee · Billing migration`));
    const after = dailyBrief(input({ commitments: [cs[0], cs[1], { ...cs[2], state: 'met', metOn: D }] }), D);
    expect(after).not.toContain('two-days-over'); expect(after).toContain('in-three-weeks'); expect(after).toContain('commitment:ea.today');
  });
  it('test:ea.overdue-stays-until-met-or-moved — slipping every day after, until its state changes', () => {
    const x = c('slips', { due: '2026-10-02' });
    for (const day of ['2026-10-03', '2026-10-04', '2026-10-09']) { const md = dailyBrief(input({ commitments: [x] }), day); expect(md.indexOf('commitment:ea.slips')).toBeGreaterThan(md.indexOf('## Late')); expect(md).toMatch(/\d+ days? late/); }
    expect(dailyBrief(input({ commitments: [{ ...x, state: 'dropped', reason: 'n/a' }] }), '2026-10-09')).not.toContain('slips');
    const moved = { ...x, state: 'moved', due: '2026-10-20' };
    const md = dailyBrief(input({ commitments: [moved] }), '2026-10-09');
    expect(md).not.toContain('## Late'); expect(md).toContain('due 2026-10-20');
  });
  it('test:ea.met-leaves-briefs — met today is gone, and keeps the day it was met on', () => {
    const x = c('ship-it');
    const p = commitmentOp(x, { op: 'met', id: x.id }, D);
    expect(p).toEqual({ ok: true, props: { state: 'met', 'met-on': D } });
    expect(dailyBrief(input({ commitments: [{ ...x, state: 'met', metOn: D }] }), D)).not.toContain('ship-it');
  });
  it('test:ea.brief-lists-decisions-waiting — the director\'s proposed decisions, not another\'s or an approved one', () => {
    const dec = (slug: string, owner: string, status: string) => ({ id: `decision:ea.${slug}`, title: slug, status, owner, project: 'project:ea.billing', from: '' });
    const md = dailyBrief(input({ decisions: [dec('mine-1', 'person:ea.alex', 'proposed'), dec('mine-2', 'person:ea.alex', 'proposed'), dec('lees', 'person:ea.lee', 'proposed'), dec('mine-done', 'person:ea.alex', 'approved')] }, { follow: [follow({ id: 'decision:wye.y', kind: 'decision', title: 'cross-product', status: 'proposed', link: '/wye/v2/d/d#n-decision%3Awye.y' })] }), D);
    const s = at(md, '## Decisions waiting on you');
    expect(at(md, '(decision:ea.mine-1)')).toBeGreaterThan(s); expect(at(md, '(decision:ea.mine-2)')).toBeGreaterThan(s);
    expect(at(md, '[cross-product](/wye/v2/d/d#n-decision%3Awye.y)')).toBeGreaterThan(s);
    expect(md).not.toContain('decision:ea.lees'); expect(md).not.toContain('mine-done');
  });
  it('test:ea.brief-lists-replies-owed — the follow items with the people they concern, linking into their product', () => {
    const md = dailyBrief(input({}, { follow: [follow({ title: 'Review the plan', people: [{ id: 'person:wye.bo', name: 'Bo' }] }), follow({ id: 'question:wye.q', kind: 'question', title: 'Which cache?', why: '@follow', owner: 'bo', link: '/wye/v2/d/prd#n-question%3Awye.q', people: [{ name: 'bo' }] })] }), D);
    const s = at(md, '## You owe a reply or a follow-up');
    expect(at(md, '- [Review the plan](/wye/v2/d/plan#n-task%3Ax) — wye › v2 · task (open) · yours · with [Bo](person:wye.bo)')).toBeGreaterThan(s);
    expect(at(md, '[Which cache?](/wye/v2/d/prd#n-question%3Awye.q) — wye › v2 · question (open) · @follow · with bo')).toBeGreaterThan(s);
  });
  it('test:ea.brief-lists-projects-changed-since-yesterday — pace and date changes since the last brief, only those, once', () => {
    const before = model({ commitments: [c('cutover', { due: '2026-10-10', project: 'project:ea.search' })] });
    const day1 = snapshotOf(before, '2026-10-04');
    const now = model({ projects: [project('billing', 'Billing migration', { pace: 'slowing' }), project('search', 'Search v2'), project('infra', 'Infra')], commitments: [c('cutover', { due: '2026-10-17', state: 'moved', project: 'project:ea.search', moves: [{ id: 'move:ea.cutover-1', n: 1, from: '2026-10-10', to: '2026-10-17', on: D, why: 'vendor slipped' }] })] });
    const md = dailyBrief({ ...input(), model: now, previous: day1 }, D);
    const s = at(md, '## Changed since yesterday');
    expect(at(md, '- [Billing migration](project:ea.billing) — pace holding → slowing')).toBeGreaterThan(s);
    expect(at(md, '[cutover](commitment:ea.cutover) — Lee · Search v2 · due 2026-10-10 → 2026-10-17 because vendor slipped')).toBeGreaterThan(s);
    expect(md.slice(s)).not.toContain('Infra');
    // the next day, against the snapshot today's brief left: nothing changed again
    expect(dailyBrief({ ...input(), model: now, previous: snapshotOf(now, D) }, '2026-10-06')).not.toContain('## Changed since yesterday');
  });
  it('test:ea.brief-lines-link-to-source — every line of every section carries a link to its block', () => {
    const now = model({ projects: [project('billing', 'Billing migration', { pace: 'slowing' }), project('search', 'Search v2'), project('infra', 'Infra')], commitments: [c('late', { due: '2026-10-01' }), c('today'), c('later', { due: '2026-10-30' })], decisions: [{ id: 'decision:ea.d', title: 'd', status: 'proposed', owner: 'person:ea.alex', project: 'project:ea.billing', from: '' }] });
    const md = dailyBrief({ ...input(), model: now, follow: [follow({})], previous: snapshotOf(model(), '2026-10-04') }, D);
    for (const s of ['Late', 'Due today', 'Open, by project', 'Decisions waiting on you', 'You owe a reply or a follow-up', 'Changed since yesterday']) at(md, `## ${s}`);
    const lines = md.split('\n').filter(l => /^\s*(- |### )/.test(l));
    expect(lines.length).toBeGreaterThan(6);
    for (const l of lines) expect(l).toMatch(/\]\((commitment|decision|person|meeting|project):ea\.[a-z0-9.-]+\)|\]\(\/[a-z0-9-]+\/[a-z0-9-]+\/d\/[^)]+#n-[^)]+\)/);
  });
  it('test:ea.brief-quiet-day-one-line — nothing late or due: one line, then the open list by project', () => {
    const md = dailyBrief(input({ commitments: [c('a', { due: '2026-10-12' }), c('b', { due: '2026-10-14', project: 'project:ea.search' }), c('c', { due: '2026-11-05' })] }), D);
    const lines = md.split('\n');
    expect(lines[0]).toBe('Nothing is late or due today.');
    expect(md).not.toMatch(/## (Late|Due today|Decisions|You owe|Changed)/);
    const bill = at(md, '### [Billing migration]'), search = at(md, '### [Search v2]');
    expect(bill).toBeLessThan(search);
    expect(at(md, 'commitment:ea.a)')).toBeGreaterThan(bill); expect(at(md, 'commitment:ea.c)')).toBeGreaterThan(bill); expect(at(md, 'commitment:ea.c)')).toBeLessThan(search);
    expect(at(md, 'commitment:ea.b)')).toBeGreaterThan(search);
  });
  it('test:ea.proposed-commitment-stays-in-inbox (pure part) — a proposed commitment is never in a brief', () => {
    const md = dailyBrief(input({ commitments: [c('pushed', { status: 'proposed', due: '2026-10-06' })] }), D);
    expect(md).not.toContain('pushed'); expect(md.split('\n')[0]).toBe('Nothing is late or due today.');
  });
});

describe('commitments (req:ea.dates-followed)', () => {
  it('test:ea.move-keeps-history — two moves in order with old date, new date, when and why; briefs follow the new date', () => {
    let x = c('plan', { due: '2026-10-06' });
    const m1 = commitmentOp(x, { op: 'move', id: x.id, to: '2026-10-10', why: 'vendor slipped' }, '2026-10-05');
    expect(m1.ok && m1.line).toBe('- move:ea.plan-1 from 2026-10-06 to 2026-10-10 on 2026-10-05 because vendor slipped');
    x = { ...x, due: '2026-10-10', state: 'moved', moves: commitmentHistory(x, [m1.ok ? m1.line! : '']) };
    const m2 = commitmentOp(x, { op: 'move', id: x.id, to: '2026-10-20', why: 'scope grew', on: '2026-10-08' });
    expect(m2.ok && m2.line).toBe('- move:ea.plan-2 from 2026-10-10 to 2026-10-20 on 2026-10-08 because scope grew');
    const hist = commitmentHistory(x, [m2.ok ? m2.line! : '', m1.ok ? m1.line! : '']);
    expect(hist.map(m => [m.from, m.to, m.on, m.why])).toEqual([['2026-10-06', '2026-10-10', '2026-10-05', 'vendor slipped'], ['2026-10-10', '2026-10-20', '2026-10-08', 'scope grew']]);
    expect(commitmentOp(x, { op: 'move', id: x.id, to: '2026-10-30', why: '  ' }).ok).toBe(false);
    const md = dailyBrief(input({ commitments: [{ ...x, due: '2026-10-20', moves: hist }] }), '2026-10-12');
    expect(md).toContain('due 2026-10-20'); expect(md).not.toContain('## Late');
  });
  it('test:ea.project-slip-count — two moves across one commitment; the weekly review lists the week\'s moves with reasons', () => {
    const moves = [{ id: 'move:ea.a-1', n: 1, from: '2026-10-01', to: '2026-10-06', on: '2026-09-30', why: 'late start' }, { id: 'move:ea.a-2', n: 2, from: '2026-10-06', to: '2026-10-13', on: '2026-10-07', why: 'review took longer' }];
    const cs = [c('a', { due: '2026-10-13', state: 'moved', moves }), c('b', { due: '2026-10-15' }), c('c', { due: '2026-10-20' })];
    expect(slipCount('project:ea.billing', cs)).toBe(2);
    expect(cs.filter(x => x.moves.length).length).toBe(1);
    const md = weeklyReview(input({ commitments: cs }), '2026-10-09');
    const b = at(md, '## [Billing migration](project:ea.billing)');
    expect(at(md, '[a](commitment:ea.a) 2026-10-06 → 2026-10-13 on 2026-10-07 because review took longer')).toBeGreaterThan(b);
    expect(md).toContain('2 moves in all'); expect(md).not.toContain('because late start'); // that move was the week before
  });
  it('test:ea.dropped-closed-with-reason — closed with its reason; refused without one; no later brief lists it', () => {
    const x = c('old-idea', { due: '2026-10-01' });
    expect(commitmentOp(x, { op: 'drop', id: x.id, why: '' })).toEqual({ ok: false, message: 'dropping needs a reason: --why "…"' });
    expect(commitmentOp(x, { op: 'drop', id: x.id, why: 'no longer needed' })).toEqual({ ok: true, props: { state: 'dropped', reason: 'no longer needed' } });
    const dropped = { ...x, state: 'dropped', reason: 'no longer needed' };
    expect(commitmentOp(dropped, { op: 'met', id: x.id }).ok).toBe(false);
    for (const d of [D, '2026-10-20']) expect(dailyBrief(input({ commitments: [dropped] }), d)).not.toContain('old-idea');
  });
});

describe('weekly review (req:ea.weekly-pace) and 1:1 prep (req:ea.one-on-one-prep)', () => {
  it('needing the director first; a project with no news is gone quiet, never on track', () => {
    const W = '2026-10-09';
    const m = { id: 'meeting:ea.sync', title: 'sync', status: 'approved', date: '2026-10-07', attendees: [], projects: ['project:ea.billing'], source: 'cowork', type: '' };
    const md = weeklyReview(input({ meetings: [m], projects: [project('billing', 'Billing migration', { updates: [{ id: 'update:ea.u1', text: 'rehearsal passed', date: '2026-10-08', from: '' }] }), project('search', 'Search v2', { status: 'at-risk' }), project('infra', 'Infra')], commitments: [c('met-one', { state: 'met', metOn: '2026-10-06', due: '2026-10-06' }), c('planned', { due: '2026-10-08' }), c('s', { project: 'project:ea.search', due: '2026-10-07' })], risks: [{ id: 'risk:ea.vendor', title: 'vendor down', status: 'approved', owner: '', project: 'project:ea.search', severity: 'high', from: '' }] }), W);
    expect(md.split('\n')[0]).toBe('Week ending 2026-10-09: 3 projects need you (of 3).');
    // Infra has no news: gone quiet, not on track
    expect(md).toMatch(/## \[Infra\]\(project:ea\.infra\) — holding · gone quiet/);
    expect(md).toContain('## [Search v2](project:ea.search) — at risk · holding · gone quiet');
    expect(md).toContain('[vendor down](risk:ea.vendor) (high)');
    expect(md).toContain('Blockers — overdue');
    expect(md).toMatch(/## \[Billing migration\]\(project:ea\.billing\) — on track · holding\n\n- Done vs planned: 1 met of 2 planned this week/);
    expect(md.indexOf('## [Billing migration]')).toBeGreaterThan(md.indexOf('## [Search v2]')); // at risk, quiet and overdue first; Billing needs the director only for its overdue one
  });
  it('the 1:1: threads, who owes whom by when, the last 1:1s with what came of them, their projects', () => {
    const mt = { id: 'meeting:ea.lee-1on1-2026-09-28', title: 'Lee 1:1', status: 'approved', date: '2026-09-28', attendees: ['person:ea.alex', 'person:ea.lee'], projects: [], source: 'cowork', type: '1on1' };
    const md = oneOnOne(input({ meetings: [mt], commitments: [c('lee-ships', { due: '2026-10-10', to: ['person:ea.alex'], from: mt.id }), c('alex-reviews', { owner: 'person:ea.alex', to: ['person:ea.lee'], due: '2026-10-07' }), c('dana-thing', { owner: 'person:ea.dana' })], decisions: [{ id: 'decision:ea.freeze', title: 'freeze the API', status: 'approved', owner: 'person:ea.lee', project: 'project:ea.billing', from: mt.id }] }, { follow: [follow({ title: 'Lee asked for budget', people: [{ id: 'person:wye.lee', name: 'Lee' }] }), follow({ title: 'unrelated' })] }), 'person:ea.lee', D);
    expect(md.split('\n')[0]).toBe('1:1 with [Lee](person:ea.lee) on 2026-10-05: they owe 1, you owe them 1, 1 open thread.');
    expect(md).toContain('Lee asked for budget'); expect(md).not.toContain('unrelated');
    expect(at(md, '[lee ships](commitment:ea.lee-ships)')).toBeGreaterThan(at(md, '## Lee owes'));
    expect(at(md, '[alex reviews](commitment:ea.alex-reviews)')).toBeGreaterThan(at(md, '## You owe Lee'));
    expect(md).not.toContain('dana-thing');
    expect(at(md, 'decision [freeze the API](decision:ea.freeze)')).toBeGreaterThan(at(md, '## From your last 1:1s'));
    expect(at(md, '[Billing migration](project:ea.billing) — on track · holding')).toBeGreaterThan(at(md, '## Their projects'));
  });
});

describe('intake (pure)', () => {
  it('validates with clear errors', () => {
    const r = validateIntake({ meeting: { title: '', date: '10/03', attendees: 'Lee' }, items: [{ kind: 'promise', text: 'x' }, { kind: 'commitment', text: 'ship', due: 'Friday' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(['meeting.title is required', 'meeting.date must be YYYY-MM-DD (got "10/03")', 'meeting.attendees must be a list of names (strings)', 'items[0].kind must be one of decision, commitment, risk, update (got "promise")', 'items[1]: a commitment needs due as YYYY-MM-DD (got "Friday") — no date said, push it as an update']);
    const ok = validateIntake({ meeting: { title: 'Sync', date: '2026-10-03', attendees: [], type: '1on1 (only for a 1:1)' }, items: [] });
    expect(ok.ok && ok.input.meeting).toEqual({ title: 'Sync', date: '2026-10-03', attendees: [], source: 'cli', type: '1on1' });
  });
  it('plans names to nodes: alias match, a new person for an unknown name, a question for an unknown or ambiguous project or owner', () => {
    const m = model({ people: [person('alex', 'Alex', ['malapheev']), person('lee', 'Lee'), person('lee-k', 'Lee K', ['lee'])] });
    const v = validateIntake({ meeting: { title: 'Platform sync', date: '2026-10-03', attendees: ['MALAPHEEV', 'Sam'], source: 'cowork' }, items: [
      { kind: 'commitment', text: 'Sam ships the plan', owner: 'sam', due: '2026-10-10', project: 'billing migration', people: ['Alex'] },
      { kind: 'risk', text: 'Vendor down', project: 'Nope' },
      { kind: 'decision', text: 'Freeze', owner: 'Lee', project: 'Search v2' },
      { kind: 'update', text: 'Rehearsal passed', project: 'billing' }] });
    if (!v.ok) throw new Error(v.errors.join());
    const p = planIntake(m, v.input, 'ea', { ids: new Set(), from: new Map() });
    expect(p.meeting.id).toBe('meeting:ea.platform-sync-2026-10-03');
    expect(p.meeting.props.attendees).toBe('[person:ea.alex, person:ea.sam]');
    expect(p.people.map(x => [x.id, x.status])).toEqual([['person:ea.sam', 'proposed']]);
    expect(p.cards).toEqual([{ kind: 'commitment', id: 'commitment:ea.sam-ships-the-plan', title: 'Sam ships the plan', status: 'proposed', exists: false, props: { owner: 'person:ea.sam', due: '2026-10-10', state: 'open', project: 'project:ea.billing', from: 'meeting:ea.platform-sync-2026-10-03', to: '[person:ea.alex]', by: 'agent:cowork' } }]);
    expect(p.questions.map(q => q.line)).toEqual([
      '- question:ea.platform-sync-2026-10-03-q2 Which project is "Vendor down" about? "Nope" is not a project here. #open (related-to: [meeting:ea.platform-sync-2026-10-03])',
      '- question:ea.platform-sync-2026-10-03-q3 Who is "Lee" in "Freeze"? #open (related-to: [meeting:ea.platform-sync-2026-10-03, person:ea.lee, person:ea.lee-k])']);
    expect(p.updates[0]).toEqual({ under: 'project:ea.billing', id: 'update:ea.platform-sync-2026-10-03-u4', line: '- update:ea.platform-sync-2026-10-03-u4 Rehearsal passed #proposed (from: meeting:ea.platform-sync-2026-10-03, date: 2026-10-03, by: agent:cowork)' });
    // pushed again: the meeting and the card are there, from that meeting — nothing new
    const again = planIntake({ ...m, people: [...m.people, person('sam', 'sam')] }, v.input, 'ea', { ids: new Set([p.meeting.id, 'person:ea.sam', 'commitment:ea.sam-ships-the-plan']), from: new Map([['commitment:ea.sam-ships-the-plan', p.meeting.id]]) });
    expect(again.meeting.exists).toBe(true); expect(again.cards).toEqual([]); expect(again.people).toEqual([]); expect(again.skipped).toEqual(['commitment:ea.sam-ships-the-plan']);
  });
});
