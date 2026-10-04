import { NextResponse } from 'next/server';
import { productBatches, pagesLeft, controlBatch } from '@/lib/import-run';

// The product's background imports (lib:import-run), for the rail's Agents folder: running ones with how far they
// got and the file in hand, and stopped ones (Stop, or a server restart) with files left.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const batches = [...productBatches(product), ...(await pagesLeft(product))];
  return NextResponse.json({ batches: batches.map(({ requestSlug, project, title, total, done, current, stopped, legacy, next }) => ({ requestSlug, project, title, total, done, current, stopped: !!stopped, legacy: !!legacy, next: next ?? [] })) });
}

// POST { slug, action: 'stop' | 'resume' } — stop starts no further file; resume goes on from the first file not done.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const { slug, action } = (await req.json().catch(() => ({}))) as { slug?: string; action?: string };
  if (!slug || (action !== 'stop' && action !== 'resume')) return NextResponse.json({ error: 'invalid', message: 'slug and action stop|resume required' }, { status: 422 });
  const b = await controlBatch(product, slug, action);
  if (!b) return NextResponse.json({ error: 'not_found', message: `no import ${slug} to ${action}` }, { status: 404 });
  return NextResponse.json({ ok: true, done: b.done, total: b.total, stopped: !!b.stopped });
}
