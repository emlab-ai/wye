import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getChange } from '@/lib/changes';
import { runImpact, applyPatch, skipPatch, type ImpactSet } from '@/lib/impact-run';

// op:api.impact — POST { action: 'run' } runs the impact analysis for the change now, with the model, whatever the
// product's mode (req:exec.impact-set); { action: 'apply', candidate, text?, props?, force? } writes a proposed
// update through the writer (req:exec.impact-patch); { action: 'apply-all' } every unedited, un-dealt-with update;
// { action: 'skip', candidate, reason? } declines one. `by` names the person.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await getChange(p.dir, id); if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { action?: string; candidate?: string; text?: string; props?: Record<string, string>; by?: string; reason?: string; force?: boolean };
  const by = body.by?.trim() || req.headers.get('x-wf-by') || 'person';
  if (body.action === 'run') {
    // the run goes on after the response; the card fills in from the record as verdicts land
    void runImpact(p.dir, product, id, { force: true, log: m => console.log(`[wf] ${m}`) }).catch(e => console.log(`[wf] impact: ${e instanceof Error ? e.message : e}`));
    await new Promise(res => setTimeout(res, 300));
    const cur = await getChange(p.dir, id);
    return NextResponse.json({ ok: true, impact: cur?.impact ?? null });
  }
  if (body.action === 'apply') {
    if (!body.candidate) return NextResponse.json({ error: 'invalid', message: 'candidate required' }, { status: 422 });
    const a = await applyPatch(p.dir, product, id, body.candidate, { text: body.text, props: body.props, by, force: body.force });
    if (!a.ok) return NextResponse.json({ error: a.error, message: a.message }, { status: a.error === 'stale' ? 409 : a.error === 'not_found' ? 404 : 422 });
    return NextResponse.json(a);
  }
  if (body.action === 'apply-all') {
    const set = r.impact as ImpactSet | undefined; const done: string[] = []; const failed: { id: string; message: string }[] = [];
    for (const c of set?.candidates ?? []) { if (c.verdict !== 'update' || c.outcome) continue; const a = await applyPatch(p.dir, product, id, c.id, { by }); if (a.ok) done.push(c.id); else failed.push({ id: c.id, message: a.message }); }
    return NextResponse.json({ ok: true, applied: done, failed });
  }
  if (body.action === 'skip') {
    if (!body.candidate) return NextResponse.json({ error: 'invalid', message: 'candidate required' }, { status: 422 });
    return NextResponse.json({ ok: await skipPatch(p.dir, id, body.candidate, by, body.reason) });
  }
  return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
}
