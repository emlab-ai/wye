import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { readPlanDoc, planDefinition, refreshPlanStatuses } from '@/lib/plan-docs';
import { getFrontmatter, setFrontmatter, requestTaskId } from '@/lib/plan-doc';
import { PLAN_STATUSES } from '@/lib/props';
import { writeAtomic, rebuild } from '@/lib/write';

// op:api.plan (decision:exec.plan-lifecycle, req:exec.plan-defined) — GET ?ref=product/project/plan-x → the plan's
// status and Definition state (n blocks, k agreed, j open, contradicted, missing) and its request task — the frontmatter
// `task:` when the plan was built for an existing task, else the `task:<slug>` line the request wrote (rule:plan-doc);
// PATCH { ref, status } sets the status.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const ref = new URL(req.url).searchParams.get('ref'); if (!ref) return NextResponse.json({ error: 'invalid', message: 'ref required' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const plan = await readPlanDoc(product, ref); if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const d = planDefinition(scope, plan.md);
  return NextResponse.json({ ref, node: `plan:${plan.slug}`, status: getFrontmatter(plan.md, 'status') ?? '', role: getFrontmatter(plan.md, 'role') ?? 'worker', task: getFrontmatter(plan.md, 'task') ?? (plan.md.includes(`${requestTaskId(plan.slug)} `) ? requestTaskId(plan.slug) : null), session: getFrontmatter(plan.md, 'session') ?? '', definition: d }, { headers: { 'cache-control': 'no-store' } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json()) as { ref?: string; status?: string };
  if (!body.ref || !body.status || !PLAN_STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid', message: `ref and a status among ${PLAN_STATUSES.join(', ')} required` }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const plan = await readPlanDoc(product, body.ref); if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await writeAtomic(plan.file, setFrontmatter(plan.md, 'status', body.status));
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, status: body.status });
}

// POST { action: 'refresh' } → recompute defining ↔ defined for every plan from its Definition; returns what moved.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'refresh') return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try { return NextResponse.json({ ok: true, moved: await refreshPlanStatuses(scope) }); } catch (e) { return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.stack ?? e.message : String(e) }, { status: 500 }); }
}
