import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { workflowsOf, admits } from '@/lib/runs';
import { startRun } from '@/lib/runs-run';

// op:api.workflows (decision:wf2.workflow-is-a-skill) — GET → the product's workflows with their stages, and the
// `until` lines that do not parse (`bad`), so a criterion that can gate nothing is visible before it is run;
// ?node=<id> narrows to the workflows that run on that node's kind — what ⌘P and a column offer.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = new URL(req.url).searchParams.get('node');
  const kind = node ? scope.idx.byId.get(node)?.kind ?? node.split(':')[0] : null;
  const workflows = workflowsOf(scope.graph, scope.idx)
    .filter(w => !kind || admits(w, kind))
    .map(w => ({ ...w, bad: w.stages.flatMap(s => s.badUntil.map(b => `${s.id}: ${b}`)) }));
  return NextResponse.json({ workflows }, { headers: { 'cache-control': 'no-store' } });
}

// POST { workflow, on, again? } → a run starts on that node, its first stage entered at once.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => ({})) as { workflow?: string; on?: string; again?: boolean };
  if (!b.workflow || !b.on) return NextResponse.json({ error: 'invalid', message: 'workflow and on required' }, { status: 422 });
  try { const r = await startRun(product, b.workflow, b.on, { by: 'person', again: b.again }); return NextResponse.json({ ok: true, ...r }); }
  catch (e) { return NextResponse.json({ error: 'invalid', message: e instanceof Error ? e.message : String(e) }, { status: 422 }); }
}
