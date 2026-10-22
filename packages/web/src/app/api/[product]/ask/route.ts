import { askEnv } from '@/lib/ask/env';
import { ask } from '@/lib/ask/ask';
import { codeRoot } from '@/lib/ask/refresh';
import type { AskRequest } from '@/lib/ask/types';
import { markStep } from '@/lib/onboarding-io';
import { MAX_ROUNDS, MAX_HOPS } from '@/lib/ask/plan';

export const dynamic = 'force-dynamic';
// POST { q, history?, lanes?, model?, rounds?, hops?, sources? } → server-sent events (decision:wf2.ask-two-lanes): results, fast.delta…, fast.done,
// step / found while the deep lane works, deep.delta…, deep.done, error per lane, done. Closing the request stops both.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json().catch(() => ({}))) as AskRequest;
  const q = String(body.q ?? '').trim();
  if (q.length < 3) return Response.json({ error: 'invalid', message: 'a question of at least 3 characters' }, { status: 422 });
  const model = body.model == null ? undefined : String(body.model).trim();
  if (model && !/^[a-z0-9][a-z0-9.-]{1,63}$/i.test(model)) return Response.json({ error: 'invalid', message: 'model: a claude model id or alias (sonnet, claude-haiku-5-5 …)' }, { status: 422 });
  // the query plan's rounds and hops (plan:ask-query-plan): opt-in, whole numbers in range; sources: a boolean
  const int = (v: unknown, max: number) => v == null ? undefined : Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= max ? Number(v) : NaN;
  const rounds = int(body.rounds, MAX_ROUNDS), hops = int(body.hops, MAX_HOPS);
  if (Number.isNaN(rounds) || Number.isNaN(hops)) return Response.json({ error: 'invalid', message: `rounds: 1–${MAX_ROUNDS}, hops: 1–${MAX_HOPS}` }, { status: 422 });
  const env = await askEnv(product, { rerank: true }); if (!env) return Response.json({ error: 'not_found' }, { status: 404 });
  const wfUrl = new URL(req.url).origin;
  const enc = new TextEncoder(); const ac = new AbortController();
  req.signal.addEventListener('abort', () => ac.abort(), { once: true });
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (name: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { ac.abort(); } };
      try { let marked = false;
        for await (const e of ask({ ctx: env.ctx, productDir: env.scope.product.dir, codeRoot: codeRoot(env.scope.product) ?? '', degraded: env.degraded, indexing: env.indexing, types: env.scope.graph.types }, { q, history: body.history, lanes: body.lanes, model, rounds, hops, sources: body.sources === true }, { signal: ac.signal, wfUrl })) {
          send(e.type, e);
          // the Quick start's `ask` step: a lane answered (markStep never throws)
          if (!marked && (e.type === 'fast.done' || e.type === 'deep.done')) { marked = true; void markStep(env.scope.product.slug, 'ask'); }
        }
      }
      catch (e) { send('error', { type: 'error', lane: 'retrieve', message: String(e) }); }
      try { ctrl.close(); } catch { /* closed */ }
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
