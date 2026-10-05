import { getProduct } from '@/lib/products';
import { subscribeChanges } from '@/lib/watch';
import { deltaSince, graphFor, graphRev } from '@/lib/build';

export const dynamic = 'force-dynamic';

// Server-sent events: what changed on disk for this product (documents, graph, inbox, sessions), batched per 300 ms.
// A batch that says the graph changed also says what in it did (decision:wf2.change-names-what-changed): `graph` is
// the ids touched since this subscriber's last event and whether any of it is knowledge (lib/graph-delta) — a save of
// prose rebuilds the graph and changes next to none of it, and an open page asks again only for what is named.
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
      let rev = graphRev(p.dir); // the graph this subscriber's page was rendered from, near enough: the next event is relative to it
      unsub = subscribeChanges(p.dir, e => { batch.push(e); if (!timer) timer = setTimeout(async () => {
        const b = batch; batch = []; timer = null;
        const kinds = [...new Set(b.map(x => x.kind))];
        let graph;
        // graphFor reads the file again when it was built outside the app (a CLI build): that is a step with a delta too
        if (kinds.includes('graph')) { try { await graphFor(p.dir); graph = deltaSince(p.dir, rev); rev = graphRev(p.dir); } catch { /* unknown: the page takes it as everything */ } }
        send('change', { kinds, files: [...new Set(b.map(x => x.file))].slice(0, 20), ...(graph ? { graph } : {}) });
      }, 300); });
      ping = setInterval(() => send('ping', {}), 20000);
      req.signal.addEventListener('abort', () => { unsub(); if (ping) clearInterval(ping); if (timer) clearTimeout(timer); try { ctrl.close(); } catch { /* closed */ } });
    },
    cancel() { unsub(); if (ping) clearInterval(ping); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
