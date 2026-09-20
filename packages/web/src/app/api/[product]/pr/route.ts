import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { readPrDoc, prDefinition, prReadiness, approvePr, cancelPr, reopenPr } from '@/lib/pr-docs';
import { stopRefining } from '@/lib/pr-sessions';
import { getFrontmatter, setFrontmatter, requestTaskId, prNumberOf, prLabel } from '@/lib/pr-doc';
import { PR_STATUSES } from '@/lib/props';
import { writeAtomic, rebuild } from '@/lib/write';

// op:api.pr (decision:wf2.pr-lifecycle, decision:wf2.pr-approval-is-the-persons-click) — GET ?ref=product/project/pr-x →
// the PR's status, Definition state (n blocks, k agreed, j open, contradicted, missing), readiness (definition · agreed ·
// impact · contradictions · tasks), who approved it and its request task — the frontmatter `task:` when the PR was made
// for an existing task, else the `task:<slug>` line the request wrote (rule:pr-doc).
// PATCH { ref, action: 'approve' | 'cancel' | 'reopen', by? } — the person's moves: approve sets approved + approved-by /
// approved-at and stops a live refining session; cancel ends it; reopen puts it back to draft. PATCH { ref, status } sets a status outright.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const ref = new URL(req.url).searchParams.get('ref'); if (!ref) return NextResponse.json({ error: 'invalid', message: 'ref required' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pr = await readPrDoc(product, ref); if (!pr) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const d = prDefinition(scope, pr.md);
  const num = prNumberOf(pr.slug); const title = getFrontmatter(pr.md, 'title') ?? pr.slug;
  return NextResponse.json({ ref, node: num ? `pr:${num}` : `pr:${pr.slug}`, num, title, label: num ? prLabel(num, title) : title, status: getFrontmatter(pr.md, 'status') ?? '', role: getFrontmatter(pr.md, 'role') ?? 'worker', task: getFrontmatter(pr.md, 'task') ?? (pr.md.includes(`${requestTaskId(pr.slug)} `) ? requestTaskId(pr.slug) : null), session: getFrontmatter(pr.md, 'session') ?? '', approvedBy: getFrontmatter(pr.md, 'approved-by') ?? null, approvedAt: getFrontmatter(pr.md, 'approved-at') ?? null, definition: d, readiness: prReadiness(scope, pr.md) }, { headers: { 'cache-control': 'no-store' } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json()) as { ref?: string; status?: string; action?: 'approve' | 'cancel' | 'reopen'; by?: string };
  if (!body.ref) return NextResponse.json({ error: 'invalid', message: 'ref required' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pr = await readPrDoc(product, body.ref); if (!pr) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const by = (body.by ?? '').trim() || 'person';
  if (body.action === 'approve') {
    await approvePr(scope.product.dir, product, body.ref, by);
    const stopped = await stopRefining(scope.product.dir, body.ref, `The PR was approved by ${by} — stop here; say in one line what is on the page.`).catch(() => []);
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
