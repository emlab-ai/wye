import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { addInboxItem, linkInboxItem, listInboxItems } from '@/lib/inbox';
import { digestRaw, judgeRawImpact } from '@/lib/inbox-raw';
import { jevClient } from '@/lib/jev';
import { loadGraph } from '@/lib/load';

// GET → the inbox items. POST { type?, title?, text?, from?, refs?, session?, fields?, digest? } → adds one (agents: wye inbox add);
// with `digest: true` a Remember session starts on it at once (wye remember) and the answer names it.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ items: await listInboxItems(p.dir) }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { type?: string; title?: string; text?: string; from?: string; refs?: string[]; session?: string; fields?: Record<string, string>; digest?: boolean; raw?: boolean };
  if (!(body.title ?? '').trim() && !(body.text ?? '').trim() && !Object.values(body.fields ?? {}).some(v => v?.trim())) return NextResponse.json({ error: 'invalid', message: 'a title, text or fields are required' }, { status: 422 });
  const raw = body.raw === true || body.digest === true; // what is digested is the person's words: raw input, never a block
  const name = await addInboxItem(p.dir, { ...body, type: raw ? 'note' : body.type, raw });
  const link = async () => { const c = await jevClient(); if (!c.enabled) return; await linkInboxItem(p.dir, await loadGraph(p.graphPath), name, c); };
  if (body.digest !== true) {
    // linked on arrival (Jev auto-linking design §2), detached: the response does not wait for the judgement
    void link().catch(e => console.warn('jev: inbox link failed —', e instanceof Error ? e.message : e));
    return NextResponse.json({ ok: true, name }, { status: 201 });
  }
  // raw input, digested: linked first, its impact on what is known judged (decision:waterfall.raw-input-stays-raw), then
  // the digest — a Remember conversation as the command box starts one (a librarian on Claude Code, in the Wye folder)
  // with the impact in its brief and told that the input is a request, not knowledge
  await link().catch(e => console.warn('jev: inbox link failed —', e instanceof Error ? e.message : e));
  const impact = await judgeRawImpact(p.dir, product, name);
  const d = await digestRaw(p, product, name, impact, new URL(req.url).origin);
  return NextResponse.json({ ok: true, name, session: d.session, impact, ...(d.error ? { error: d.error } : {}) }, { status: 201 });
}
