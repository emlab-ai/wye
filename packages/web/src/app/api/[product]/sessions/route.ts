import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { AGENTS, createSession, listSessions, listRunners, setPrDoc } from '@/lib/sessions';
import { startChat, liveState, reconcileStale } from '@/lib/agent-host';
import { askingOf } from '@/lib/asking';
import { createPrDoc, readPrDoc, setRefining } from '@/lib/pr-docs';
import { markReading, runIntake } from '@/lib/pr-intake';
import { buildPrompt } from '@/lib/agent-host';
import { prsOf } from '@/lib/pr-doc';
import { loadScope } from '@/lib/scope';
import { stat } from 'node:fs/promises';
import { REPO_ROOT } from '@/lib/products';

// GET → { sessions } — each with its requests from the graph (decision:wf2.plan-per-request); POST { agent, instruction, refs?, source?, images?, pr? } → the new session (status queued).
// `pr: true` (or role librarian) makes a Prompt Request: the page is created as draft, set refining, and a librarian refines it (decision:wf2.cmd-modes);
// `pr: false` is an ad-hoc conversation on the chosen agent — no page.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await reconcileStale(p.dir);
  const scope = await loadScope(product);
  const sessions = (await listSessions(p.dir)).map(s => { const live = s.mode === 'chat' ? liveState(s.id) : {}; return { ...s, transcript: undefined, ...live, asking: (live as { live?: boolean }).live ? askingOf(s.transcript ?? []) : undefined, prs: scope ? prsOf(product, scope.graph, s.id) : [] }; });
  return NextResponse.json({ sessions, runners: await listRunners(p.dir), defaults: { cwd: p.meta.repo ?? '', waterfall: REPO_ROOT } }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; instruction?: string; refs?: string[]; source?: Record<string, string>; mode?: 'run' | 'chat'; cwd?: string; pr?: boolean; prRef?: string; images?: { name?: string; dataUrl: string }[]; role?: 'worker' | 'librarian' };
  // Ask Wye (req:exec.ask-wye): a librarian session — claude on the host with the librarian prompt, in the Wye repo
  const role = body.pr === true || body.role === 'librarian' ? 'librarian' : 'worker';
  const agent = role === 'librarian' ? 'claude-code' : AGENTS.find(a => a.id === body.agent)?.id;
  const instruction = (body.instruction ?? '').trim();
  if (!agent) return NextResponse.json({ error: 'invalid', message: 'unknown agent' }, { status: 422 });
  const images = Array.isArray(body.images) ? body.images.filter(i => i && typeof i.dataUrl === 'string').slice(0, 8) : [];
  if (!instruction && !images.length) return NextResponse.json({ error: 'invalid', message: 'instruction required' }, { status: 422 });
  const mode = body.mode === 'chat' || role === 'librarian' ? 'chat' : 'run';
  const cwd = role === 'librarian' ? REPO_ROOT : body.cwd?.trim() || '';
  if (mode === 'chat') {
    // a conversation always works in a folder: the agent's tools read and write there
    if (!cwd) return NextResponse.json({ error: 'invalid', message: 'a working folder is required' }, { status: 422 });
    try { if (!(await stat(cwd)).isDirectory()) throw new Error(); } catch { return NextResponse.json({ error: 'invalid', message: `folder not found: ${cwd}` }, { status: 422 }); }
  }
  const s = await createSession(p.dir, product, { agent, instruction: instruction || '(image)', refs: (body.refs ?? []).filter(r => typeof r === 'string').slice(0, 50), source: body.source ?? {}, mode, cwd: cwd || undefined, images, role });
  // a request has its page before the first message names it (rule:pr-doc); an ad-hoc conversation and a queued run have none
  const wfUrl = new URL(req.url).origin;
  if (role === 'librarian') {
    // `prRef`: refine an existing PR (its page stays; the message row on the PR head) instead of making a page
    const existing = body.prRef && (await readPrDoc(product, body.prRef)) ? body.prRef : null;
    if (existing) { await setPrDoc(p.dir, s.id, existing, `refines ${existing}`); s.prDoc = existing; await setRefining(p.dir, product, existing); }
    else s.prDoc = (await createPrDoc(p.dir, product, s)) ?? undefined;
    if (s.prDoc && existing) { const started = await startChat(p.dir, product, s.id, { wfUrl }); return NextResponse.json(started ?? s, { status: 201 }); }
    if (s.prDoc) {
      // intake first (decision:wf2.pr-intake): the page says it is being read, the person lands on it now, the
      // librarian starts once what Wye found is on the page — and in its first message
      await markReading(product, s.prDoc).catch(() => {});
      const ref = s.prDoc;
      void (async () => {
        const found = await runIntake(p.dir, product, s.id, ref, instruction, s.refs).catch(e => { console.warn('[wf] intake:', e instanceof Error ? e.message : e); return ''; });
        const first = (await buildPrompt(product, s, wfUrl, p.dir)) + found;
        await startChat(p.dir, product, s.id, { wfUrl, firstMessage: first, shown: s.instruction, images: s.images });
      })();
      return NextResponse.json(s, { status: 201 });
    }
  }
  if (mode === 'chat') { const started = await startChat(p.dir, product, s.id, { wfUrl }); return NextResponse.json(started ?? s, { status: 201 }); }
  return NextResponse.json(s, { status: 201 });
}
