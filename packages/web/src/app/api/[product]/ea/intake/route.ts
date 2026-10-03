import { NextResponse } from 'next/server';
import { runIntake } from '@/lib/ea/intake-run';

// op:api.ea-intake (decision:ea.tools-push-through-cli, task:ea.cli-intake) — POST { analysis, project? } (or the
// analysis itself as the body) → the meeting and its items filed proposed; returns the summary: created ids, update
// and question lines, inbox items, what was already there. 422 lists every problem with the analysis.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => null) as { analysis?: unknown; project?: string; meeting?: unknown } | null;
  if (!b) return NextResponse.json({ error: 'invalid', message: 'the body must be JSON' }, { status: 422 });
  const analysis = b.analysis ?? b;
  try {
    const r = await runIntake(product, analysis, { project: typeof b.project === 'string' && b.analysis ? b.project : undefined });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message, errors: r.errors }, { status: r.status });
    return NextResponse.json({ ok: true, ...r.summary });
  } catch (e) { return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
