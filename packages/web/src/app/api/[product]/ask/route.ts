import { askEnv } from '@/lib/ask/env';
import { ask } from '@/lib/ask/ask';
import { codeRoot } from '@/lib/ask/refresh';
import type { AskRequest } from '@/lib/ask/types';

export const dynamic = 'force-dynamic';
// POST { q, history?, lanes? } → server-sent events (decision:wf2.ask-two-lanes): results, fast.delta…, fast.done,
// step / found while the deep lane works, deep.delta…, deep.done, error per lane, done. Closing the request stops both.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json().catch(() => ({}))) as AskRequest;
  const q = String(body.q ?? '').trim();
  if (q.length < 3) return Response.json({ error: 'invalid', message: 'a question of at least 3 characters' }, { status: 422 });
  const env = await askEnv(product, { rerank: true }); if (!env) return Response.json({ error: 'not_found' }, { status: 404 });
  const wfUrl = new URL(req.url).origin;
  const enc = new TextEncoder(); const ac = new AbortController();
  req.signal.addEventListener('abort', () => ac.abort(), { once: true });
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (name: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { ac.abort(); } };
      try { for await (const e of ask({ ctx: env.ctx, productDir: env.scope.product.dir, codeRoot: codeRoot(env.scope.product), degraded: env.degraded }, { q, history: body.history, lanes: body.lanes }, { signal: ac.signal, wfUrl })) send(e.type, e); }
      catch (e) { send('error', { type: 'error', lane: 'retrieve', message: String(e) }); }
      try { ctrl.close(); } catch { /* closed */ }
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
