import { NextResponse } from 'next/server';
import { digestContextRun, writeSummary } from '@/lib/ea/digest-run';

// op:api.ea-digest — GET [?date=YYYY-MM-DD] → { markdown, since }: what arrived, changed or closed since the last daily
// summary and what waits now, for skill:ea.daily-summary. POST { summary, date? } → writes the entry at the top of the
// Digest page's "Daily summary" section and leaves today's snapshot (decision:ea.digest-is-a-page).
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const r = await digestContextRun(product, new URL(req.url).searchParams.get('date') || undefined);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = (await req.json().catch(() => ({}))) as { summary?: string; date?: string };
  const r = await writeSummary(product, b.summary ?? '', { date: b.date, session: req.headers.get('x-wf-session') ?? undefined });
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
}
