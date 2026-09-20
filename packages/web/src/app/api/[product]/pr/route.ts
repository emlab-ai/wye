import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { readPrDoc, prDefinition } from '@/lib/pr-docs';
import { getFrontmatter, setFrontmatter, requestTaskId } from '@/lib/pr-doc';
import { PR_STATUSES } from '@/lib/props';
import { writeAtomic, rebuild } from '@/lib/write';

// op:api.plan (decision:exec.plan-lifecycle, req:exec.plan-defined) — GET ?ref=product/project/plan-x → the plan's
// status and Definition state (n blocks, k agreed, j open, contradicted, missing) and its request task — the frontmatter
// `task:` when the plan was built for an existing task, else the `task:<slug>` line the request wrote (rule:pr-doc);
// PATCH { ref, status } sets the status.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const ref = new URL(req.url).searchParams.get('ref'); if (!ref) return NextResponse.json({ error: 'invalid', message: 'ref required' }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const plan = await readPrDoc(product, ref); if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const d = prDefinition(scope, plan.md);
  return NextResponse.json({ ref, node: `pr:${plan.slug}`, status: getFrontmatter(plan.md, 'status') ?? '', role: getFrontmatter(plan.md, 'role') ?? 'worker', task: getFrontmatter(plan.md, 'task') ?? (plan.md.includes(`${requestTaskId(plan.slug)} `) ? requestTaskId(plan.slug) : null), session: getFrontmatter(plan.md, 'session') ?? '', definition: d }, { headers: { 'cache-control': 'no-store' } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json()) as { ref?: string; status?: string };
  if (!body.ref || !body.status || !PR_STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid', message: `ref and a status among ${PR_STATUSES.join(', ')} required` }, { status: 422 });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const plan = await readPrDoc(product, body.ref); if (!plan) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await writeAtomic(plan.file, setFrontmatter(plan.md, 'status', body.status));
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, status: body.status });
}
