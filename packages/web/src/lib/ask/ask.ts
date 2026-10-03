// Ask (decision:wf2.ask-two-lanes): retrieve once, then the fast and the deep lane run at the same time; their output
// is merged into one stream of events with one citation numbering. The fast lane's sources are numbered first, in the
// order its prompt lists them, so its [n] are already right; the deep lane's [[ref]] are renumbered as they stream.
import type { AskEvent, AskRequest, Citation, Hit } from './types';
import { retrieve, hrefFor, type RetrieveCtx } from './retrieve';
import { getChunks } from './store';
import { Citations, citationOf, citedNumbers } from './citations';
import { fastPrompt, fastBrief, runFast } from './fast';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runDeep } from './deep';

export type AskEnvLike = { ctx: RetrieveCtx; productDir: string; codeRoot: string; degraded?: string; indexing?: boolean };
export const DEEP_MAX_PER_PRODUCT = 2;
const deepRunning = new Map<string, number>();

export async function resolveRef(raw: string, env: AskEnvLike): Promise<Omit<Citation, 'n'> | null> {
  const { store, idx, product } = env.ctx;
  const chunkId = /^(node|doc|code|session):/.test(raw) && !idx.byId.has(raw) ? raw : idx.byId.has(raw) ? `node:${raw}` : null;
  if (chunkId) { const [c] = await getChunks(store, [chunkId]); if (c) return citationOf({ ...c, score: 0, href: hrefFor(product, c, idx) }); }
  if (idx.byId.has(raw)) { const n = idx.byId.get(raw)!; return { ref: raw, source: 'node', title: n.title || raw, href: hrefFor(product, { id: `node:${raw}`, source: 'node', ref: raw, title: '', text: '', nodes: [] }, idx), snippet: '' }; }
  const doc = raw.match(/^doc-file:([^/]+)\/(.+)$/);
  if (doc) return { ref: raw, source: 'doc', title: `${doc[1]} / ${doc[2]}`, href: `/${product}/${doc[1]}/d/${doc[2]}`, snippet: '' };
  if (/^[\w./-]+\.\w+(:\d+(-\d+)?)?$/.test(raw)) return { ref: raw, source: 'code', title: raw.replace(/:.*/, ''), href: null, snippet: '' };
  return null;
}

// The deep lane's sources in their own numbers, with their text: a passage from the index, or the lines it read.
async function answerNowPrompt(q: string, used: Citation[], env: AskEnvLike): Promise<string> {
  const parts: string[] = [];
  for (const c of used.slice(0, 25)) {
    let text = c.snippet;
    const [chunk] = await getChunks(env.ctx.store, [`${c.source}:${c.ref}`]);
    if (chunk) text = chunk.text;
    else if (c.source === 'code' && env.codeRoot) {
      const m = c.ref.match(/^(.*?):(\d+)-(\d+)$/);
      try { const lines = (await readFile(path.join(env.codeRoot, m ? m[1] : c.ref), 'utf8')).split('\n'); text = (m ? lines.slice(Number(m[2]) - 1, Math.min(Number(m[3]), Number(m[2]) + 79)) : lines.slice(0, 80)).join('\n'); } catch { /* gone */ }
    }
    parts.push(`[${c.n}] ${c.source} ${c.ref} — ${c.title}\n${text}`);
  }
  return `${fastBrief()}\nThese are the sources a search opened before it ran out of steps; cite them by their numbers.\n\n## Sources\n${parts.join('\n\n')}\n\n## Question\n${q}\n`;
}

// a tiny channel: two producers, one consumer
function channel<T>() {
  const q: T[] = []; let wake: (() => void) | null = null; let open = 0; let closed = false;
  return {
    push(x: T) { q.push(x); wake?.(); },
    producer() { open++; return () => { if (--open === 0) { closed = true; wake?.(); } }; },
    async *drain(signal: AbortSignal) {
      for (;;) {
        if (signal.aborted) return;
        if (q.length) { yield q.shift()!; continue; }
        if (closed) return;
        await new Promise<void>(r => { wake = () => { wake = null; r(); }; signal.addEventListener('abort', () => r(), { once: true }); });
      }
    },
  };
}

export async function* ask(env: AskEnvLike, req: AskRequest, o: { signal: AbortSignal; wfUrl: string; maxTools?: number }): AsyncGenerator<AskEvent> {
  const lanes = req.lanes?.length ? req.lanes : ['fast', 'deep'];
  const history = (req.history ?? []).slice(-3).map(h => ({ q: h.q.slice(0, 500), a: h.a.slice(0, 1500) }));
  let hits: Hit[] = [];
  try { hits = await retrieve(env.ctx, req.q, { expand: true, rerank: true, limit: 25, budgetChars: 48000 }); }
  catch (e) { yield { type: 'error', lane: 'retrieve', message: String(e instanceof Error ? e.message : e) }; }
  if (o.signal.aborted) return;
  yield { type: 'results', hits, ...(env.degraded ? { degraded: env.degraded } : {}), ...(env.indexing ? { indexing: true } : {}) };
  if (o.signal.aborted) return;
  const cites = new Citations(); for (const h of hits) cites.add(citationOf(h));
  const ch = channel<AskEvent>();
  const product = env.ctx.product;

  if (lanes.includes('fast')) {
    const end = ch.producer();
    (async () => {
      let text = '';
      try { for await (const t of runFast(fastPrompt(req.q, hits, history), { signal: o.signal })) { text += t; ch.push({ type: 'fast.delta', text: t }); }
        if (!o.signal.aborted) ch.push({ type: 'fast.done', citations: citedNumbers(text).map(n => cites.get(n)).filter((c): c is Citation => !!c) }); }
      catch (e) { if (!o.signal.aborted) ch.push({ type: 'error', lane: 'fast', message: String(e instanceof Error ? e.message : e) }); }
      finally { end(); }
    })();
  }
  if (lanes.includes('deep')) {
    const end = ch.producer();
    (async () => {
      while ((deepRunning.get(product) ?? 0) >= DEEP_MAX_PER_PRODUCT) { ch.push({ type: 'step', text: 'Waiting for another deep search to finish' }); await new Promise(r => setTimeout(r, 1000)); if (o.signal.aborted) { end(); return; } }
      deepRunning.set(product, (deepRunning.get(product) ?? 0) + 1);
      const used: Citation[] = []; let pending = ''; let wrote = false;
      const flush = async (final: boolean) => {      // [[ref]] → [n]; hold back a trailing partial "[[…"
        let cutAt = pending.length;
        if (!final) { const open = pending.lastIndexOf('[['); if (open >= 0 && pending.indexOf(']]', open) < 0) cutAt = open; else if (pending.endsWith('[')) cutAt = pending.length - 1; }
        let head = pending.slice(0, cutAt); pending = pending.slice(cutAt);
        for (const m of [...head.matchAll(/\[\[([^\]]+)\]\]/g)]) {
          const c = await resolveRef(m[1].trim(), env);
          let rep = m[1];
          if (c) { const x = cites.add(c); if (!used.includes(x)) used.push(x); rep = `[${x.n}]`; }
          head = head.replace(m[0], rep);
        }
        if (head.trim()) wrote = true;
        if (head) ch.push({ type: 'deep.delta', text: head });
      };
      try {
        for await (const e of runDeep(req.q, history, { signal: o.signal, maxTools: o.maxTools, product, productDir: env.productDir, codeRoot: env.codeRoot, wfUrl: o.wfUrl, known: id => env.ctx.idx.byId.has(id) })) {
          if (e.type === 'step') ch.push({ type: 'step', text: e.text });
          else if (e.type === 'refs') for (const r of e.refs) { const c = await resolveRef(r, env); if (!c) continue; const x = cites.add(c); if (!used.includes(x)) { used.push(x); ch.push({ type: 'found', citation: x }); } }
          else if (e.type === 'delta') { pending += e.text; await flush(false); }
          else if (e.type === 'done') {
            await flush(true);
            // stopped at its cap before it wrote: answer now, without tools, from what it found (else from what was retrieved)
            if (e.cut && !wrote && !o.signal.aborted) { const from = used.length ? used : cites.all().slice(0, 15); if (from.length) for await (const t of runFast(await answerNowPrompt(req.q, from, env), { signal: o.signal })) { wrote = true; ch.push({ type: 'deep.delta', text: t }); } }
            ch.push({ type: 'deep.done', citations: used, ...(e.cut ? { cut: true } : {}) });
          }
        }
      } catch (e) { if (!o.signal.aborted) ch.push({ type: 'error', lane: 'deep', message: String(e instanceof Error ? e.message : e) }); }
      finally { deepRunning.set(product, (deepRunning.get(product) ?? 1) - 1); end(); }
    })();
  }
  if (!lanes.length) return;
  for await (const e of ch.drain(o.signal)) yield e;
  if (!o.signal.aborted) yield { type: 'done' };
}
