import { NextResponse } from 'next/server';
import { getProduct, REPO_ROOT } from '@/lib/products';
import { addInboxItem, digestInboxItem, linkInboxItem, listInboxItems } from '@/lib/inbox';
import { createSession } from '@/lib/sessions';
import { startChat } from '@/lib/agent-host';
import { markStep } from '@/lib/onboarding-io';
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
  const body = (await req.json()) as { type?: string; title?: string; text?: string; from?: string; refs?: string[]; session?: string; fields?: Record<string, string>; digest?: boolean };
  if (!(body.title ?? '').trim() && !(body.text ?? '').trim() && !Object.values(body.fields ?? {}).some(v => v?.trim())) return NextResponse.json({ error: 'invalid', message: 'a title, text or fields are required' }, { status: 422 });
  const name = await addInboxItem(p.dir, body);
  // linked on arrival (Jev auto-linking design §2), detached: the response does not wait for the judgement
  void (async () => { const c = await jevClient(); if (!c.enabled) return; await linkInboxItem(p.dir, await loadGraph(p.graphPath), name, c); })().catch(e => console.warn('jev: inbox link failed —', e instanceof Error ? e.message : e));
  if (body.digest !== true) return NextResponse.json({ ok: true, name }, { status: 201 });
  // the digest: a Remember conversation as the command box starts one — a librarian on Claude Code, in the Wye folder
  const wfUrl = new URL(req.url).origin;
  const d = await digestInboxItem(p.dir, name, async o => {
    const s = await createSession(p.dir, product, { agent: 'claude-code', instruction: o.instruction, refs: o.refs.slice(0, 50), source: o.source, mode: 'chat', cwd: REPO_ROOT, role: 'librarian', skills: ['skill:remember'], hooks: [] });
    void markStep(p.slug, 'remember');
    const started = await startChat(p.dir, product, s.id, { wfUrl });
    return { id: (started ?? s).id };
  });
  return NextResponse.json({ ok: true, name, session: d.session, ...(d.error ? { error: d.error } : {}) }, { status: 201 });
}
