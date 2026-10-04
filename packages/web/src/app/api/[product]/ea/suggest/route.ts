import { NextResponse } from 'next/server';
import { listSuggestions, addSuggestion, closeSuggestion } from '@/lib/ea/suggest';

// op:api.ea-suggest (decision:ea.suggested-actions) — GET [?all=1] → the open suggestions (all of them with all=1).
// POST { action: 'add', title, about?, why, source? } → a suggestion, or the open one of the same action renewed;
// POST { action: 'close', id, how: done|dismissed, reason? } → closed.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  return NextResponse.json({ suggestions: await listSuggestions(product, new URL(req.url).searchParams.get('all') === '1') });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; title?: string; about?: string; why?: string; source?: string; id?: string; how?: string; reason?: string };
  const r = b.action === 'close'
    ? await closeSuggestion(product, b.id ?? '', b.how === 'done' ? 'done' : 'dismissed', b.reason)
    : await addSuggestion(product, { title: b.title ?? '', about: b.about, why: b.why ?? '', source: b.source }, req.headers.get('x-wf-session') ? `session:${req.headers.get('x-wf-session')}` : 'agent:ea');
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
}
