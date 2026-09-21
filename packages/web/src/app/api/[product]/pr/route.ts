import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { readPrDoc, prDefinition, prReadiness, approvePr, cancelPr, reopenPr, refreshStaleScopes } from '@/lib/pr-docs';
import { stopRefining } from '@/lib/pr-sessions';
import { questionsOf, answerOnPage } from '@/lib/pr-questions';
import { answerPermission, isLive, liveState, sendMessage } from '@/lib/agent-host';
import { getSession, listSessions } from '@/lib/sessions';
import { notifyDispatch, waitingReasons } from '@/lib/dispatch';
import { firePrApproved, rememberHooksUrl } from '@/lib/hooks-run';
import { REPO_ROOT } from '@/lib/products';
import path from 'node:path';
import { getFrontmatter, setFrontmatter, requestTaskId, prNumberOf, prLabel } from '@/lib/pr-doc';
import { PR_STATUSES } from '@/lib/props';
import { skillsSection } from '@/lib/skills';
import { writeAtomic, rebuild } from '@/lib/write';

// op:api.pr (decision:wf2.pr-lifecycle, decision:wf2.pr-approval-is-the-persons-click) — GET ?ref=product/project/pr-x →
// the PR's status, Definition state (n blocks, k agreed, j open, contradicted, missing), readiness (definition · agreed ·
// impact · contradictions · tasks), who approved it and its request task — the frontmatter `task:` when the PR was made
// for an existing task, else the `task:<slug>` line the request wrote (rule:pr-doc).
// The PR's `questions` (decision:wf2.pr-questions-on-the-page) come along: the librarian's question cards with their options.
// PATCH { ref, action: 'answer', id, answer, by? } — the person's answer on the page: the card resolved; once every card of
// that request is answered the agent's AskUserQuestion is answered with them and the session goes on.
// PATCH { ref, action: 'approve' | 'cancel' | 'reopen', by? } — the person's moves: approve sets approved + approved-by /
// approved-at and stops a live refining session; cancel ends it; reopen puts it back to draft. PATCH { ref, status } sets a status outright.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const ref = new URL(req.url).searchParams.get('ref'); if (!ref) return NextResponse.json({ error: 'invalid', message: 'ref required' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pr = await readPrDoc(product, ref); if (!pr) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const d = prDefinition(scope, pr.md);
  const num = prNumberOf(pr.slug); const title = getFrontmatter(pr.md, 'title') ?? pr.slug;
  // the PR's conversation (the last session named on it): alive, busy, and the last thing the librarian said
  const sid = (getFrontmatter(pr.md, 'session') ?? '').split(/\s+/).filter(Boolean).pop();
  const sess = sid ? await getSession(scope.product.dir, sid) : null;
  const lastSaid = (sess?.transcript ?? []).filter(e => e.kind === 'assistant' && e.text?.trim()).pop()?.text?.trim().split('\n').filter(Boolean).pop()?.slice(0, 200) ?? '';
  const conversation = sess ? { id: sess.id, status: sess.status, ...liveState(sess.id), role: sess.role ?? 'worker', last: lastSaid } : null;
  const ids = (k: string) => (getFrontmatter(pr.md, k) ?? '').match(/[a-z-]+:[A-Za-z0-9_.\-]+/g) ?? [];
  return NextResponse.json({ ref, node: num ? `pr:${num}` : `pr:${pr.slug}`, num, title, label: num ? prLabel(num, title) : title, skills: ids('skills'), hooks: ids('hooks'), status: getFrontmatter(pr.md, 'status') ?? '', role: getFrontmatter(pr.md, 'role') ?? 'worker', task: getFrontmatter(pr.md, 'task') ?? (pr.md.includes(`${requestTaskId(pr.slug)} `) ? requestTaskId(pr.slug) : null), session: getFrontmatter(pr.md, 'session') ?? '', approvedBy: getFrontmatter(pr.md, 'approved-by') ?? null, approvedAt: getFrontmatter(pr.md, 'approved-at') ?? null, conversation, waiting: waitingReasons(product)[ref] ?? null, definition: d, readiness: prReadiness(scope, pr.md), questions: questionsOf(scope.graph, path.relative(REPO_ROOT, pr.file)) }, { headers: { 'cache-control': 'no-store' } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json()) as { ref?: string; status?: string; action?: 'approve' | 'cancel' | 'reopen' | 'answer' | 'attach'; by?: string; id?: string; answer?: string; skills?: string[]; hooks?: string[] };
  if (!body.ref) return NextResponse.json({ error: 'invalid', message: 'ref required' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pr = await readPrDoc(product, body.ref); if (!pr) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const by = (body.by ?? '').trim() || 'person';
  // attach (decision:wf2.hooks-and-skills): the request's skills and hooks on its page; a live librarian gets the
  // newly attached skills' bodies as its next message, so the change reaches the conversation that is on
  if (body.action === 'attach') {
    const pr = await readPrDoc(product, body.ref); if (!pr) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const skills = (body.skills ?? []).filter(x => /^skill:[A-Za-z0-9_.\-]+$/.test(x)), hooks = (body.hooks ?? []).filter(x => /^hook:[A-Za-z0-9_.\-]+$/.test(x));
    const had: string[] = (getFrontmatter(pr.md, 'skills') ?? '').match(/skill:[A-Za-z0-9_.\-]+/g) ?? [];
    let md = setFrontmatter(pr.md, 'skills', skills.length ? `[${skills.join(', ')}]` : '');
    md = setFrontmatter(md, 'hooks', hooks.length ? `[${hooks.join(', ')}]` : '');
    md = md.replace(/^(skills|hooks):\s*\n/gm, ''); // an emptied list leaves the frontmatter
    await writeAtomic(pr.file, md); await rebuild(scope.product.dir);
    const fresh = skills.filter(x => !had.includes(x));
    let told = 0;
    if (fresh.length) { const section = await skillsSection(scope, fresh, 'Skills attached to the request'); for (const s of await listSessions(scope.product.dir)) { if (s.role === 'librarian' && s.prDoc === body.ref && isLive(s.id)) { try { await sendMessage(scope.product.dir, s.id, { text: `The person attached ${fresh.join(', ')} to this request — follow ${fresh.length === 1 ? 'it' : 'them'} from here.${section}` }); told++; } catch { /* the page has them anyway */ } } } }
    return NextResponse.json({ ok: true, skills, hooks, told });
  }
  if (body.action === 'answer') {
    if (!body.id || !body.answer?.trim()) return NextResponse.json({ error: 'invalid', message: 'id and answer required' }, { status: 422 });
    const r = await answerOnPage(scope.product.dir, product, body.ref, (await loadScope(product))!.graph, body.id, body.answer.trim(), by);
    let continued = false;
    if (r.settled) {
      // the tool's input is the permission event's, with the answers filled in — the shape Claude Code reads
      const s = await getSession(scope.product.dir, r.settled.sessionId);
      const ev = (s?.transcript ?? []).find(e => e.kind === 'permission' && e.requestId === r.settled!.requestId) as { input?: unknown } | undefined;
      if (isLive(r.settled.sessionId)) continued = answerPermission(r.settled.sessionId, r.settled.requestId, true, { ...(ev?.input as object ?? {}), answers: r.settled.answers });
    }
    return NextResponse.json({ ok: true, settled: !!r.settled, continued });
  }
  if (body.action === 'approve') {
    await approvePr(scope.product.dir, product, body.ref, by);
    const stopped = await stopRefining(scope.product.dir, body.ref, `The PR was approved by ${by} — stop here; say in one line what is on the page.`).catch(() => []);
    notifyDispatch(product, new URL(req.url).origin); // the build starts from here (decision:wf2.pr-scheduler)
    rememberHooksUrl(new URL(req.url).origin); void firePrApproved(product, body.ref); // pr.approved hooks (decision:wf2.hooks-and-skills)
    return NextResponse.json({ ok: true, status: 'approved', stopped });
  }
  if (body.action === 'cancel') {
    await cancelPr(scope.product.dir, product, body.ref);
    const stopped = await stopRefining(scope.product.dir, body.ref, `The PR was cancelled by ${by} — stop here.`).catch(() => []);
    return NextResponse.json({ ok: true, status: 'cancelled', stopped });
  }
  if (body.action === 'reopen') { await reopenPr(scope.product.dir, product, body.ref); return NextResponse.json({ ok: true, status: 'draft' }); }
  if (!body.status || !PR_STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid', message: `an action (approve | cancel | reopen) or a status among ${PR_STATUSES.join(', ')} required` }, { status: 422 });
  await writeAtomic(pr.file, setFrontmatter(pr.md, 'status', body.status));
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, status: body.status });
}

// POST { action: 'rescope' } → recompute the scope of every PR whose Definition moved (decision:wf2.pr-scheduler).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'rescope') return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, rescoped: await refreshStaleScopes(scope) });
}
