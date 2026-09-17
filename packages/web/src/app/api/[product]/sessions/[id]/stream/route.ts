import { getProduct } from '@/lib/products';
import { getSession } from '@/lib/sessions';
import { subscribe, isLive } from '@/lib/agent-host';

export const dynamic = 'force-dynamic';

// Server-sent events for a chat session: the stored transcript first, then live events as they happen.
export async function GET(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return new Response('not found', { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return new Response('not found', { status: 404 });
  const enc = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (name: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ } };
      send('snapshot', { status: s.status, live: isLive(id), transcript: s.transcript ?? [] });
      unsub = subscribe(id, e => send('event', e));
      ping = setInterval(() => send('ping', { live: isLive(id) }), 15000);
      req.signal.addEventListener('abort', () => { unsub(); if (ping) clearInterval(ping); try { ctrl.close(); } catch { /* closed */ } });
    },
    cancel() { unsub(); if (ping) clearInterval(ping); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
