import { getProduct } from '@/lib/products';
import { subscribeChanges } from '@/lib/watch';

export const dynamic = 'force-dynamic';

// Server-sent events: what changed on disk for this product (documents, graph, inbox, sessions), batched per 300 ms.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return new Response('not found', { status: 404 });
  const enc = new TextEncoder();
  let unsub = () => {}; let ping: ReturnType<typeof setInterval> | null = null; let timer: ReturnType<typeof setTimeout> | null = null;
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (name: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ } };
      send('hello', { product });
      let batch: { kind: string; file: string }[] = [];
      unsub = subscribeChanges(p.dir, e => { batch.push(e); if (!timer) timer = setTimeout(() => { const b = batch; batch = []; timer = null; send('change', { kinds: [...new Set(b.map(x => x.kind))], files: [...new Set(b.map(x => x.file))].slice(0, 20) }); }, 300); });
      ping = setInterval(() => send('ping', {}), 20000);
      req.signal.addEventListener('abort', () => { unsub(); if (ping) clearInterval(ping); if (timer) clearTimeout(timer); try { ctrl.close(); } catch { /* closed */ } });
    },
    cancel() { unsub(); if (ping) clearInterval(ping); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
