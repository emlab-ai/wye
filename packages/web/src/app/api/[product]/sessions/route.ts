import { NextResponse } from 'next/server';
import { getProduct, productRepo } from '@/lib/products';
import { AGENTS, addRefs, createSession, listSessions, listRunners, setPrDoc } from '@/lib/sessions';
import { startChat, liveState, reconcileStale } from '@/lib/agent-host';
import { askingOf } from '@/lib/asking';
import { createPrDoc, goalForRequest, readPrDoc, setRefining } from '@/lib/pr-docs';
import { markReading, runIntake } from '@/lib/pr-intake';
import { buildPrompt } from '@/lib/agent-host';
import { prsOf } from '@/lib/pr-doc';
import { loadScope } from '@/lib/scope';
import { listSkills } from '@/lib/skills';
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
  const sessions = (await listSessions(p.dir)).map(s => { const live = s.mode === 'chat' ? liveState(s.id) : {}; return { ...s, transcript: undefined, artifacts: s.artifacts ? { docs: s.artifacts.docs, nodes: s.artifacts.nodes, blocks: undefined, blockCount: s.artifacts.blocks?.length ?? 0 } : undefined, ...live, asking: (live as { live?: boolean }).live ? askingOf(s.transcript ?? []) : undefined, prs: scope ? prsOf(product, scope.graph, s.id) : [] }; });
  return NextResponse.json({ sessions, runners: await listRunners(p.dir), defaults: { cwd: productRepo(p) ?? '', wye: REPO_ROOT } }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; instruction?: string; refs?: string[]; source?: Record<string, string>; mode?: 'run' | 'chat'; cwd?: string; pr?: boolean; prRef?: string; remember?: boolean; images?: { name?: string; dataUrl: string }[]; role?: 'worker' | 'librarian'; skills?: string[]; hooks?: string[]; skill?: string };
  // Ask Wye (req:exec.ask-wye): a librarian session — claude on the host with the librarian prompt, in the Wye repo
  // Remember (skill:remember): what the person pasted, filed as knowledge by a librarian — a conversation, no request page
  const remember = body.remember === true;
  // Run a skill on something (decision:wf2.run-skill-on-a-node): the skill's agent on the item the box was opened on —
  // a conversation that starts at once, no request page; the skill's own role (a librarian unless it says worker)
  const skillId = typeof body.skill === 'string' && /^skill:[\w.-]+$/.test(body.skill) ? body.skill : '';
  const skillMeta = skillId ? await (async () => { const sc = await loadScope(product); return sc ? (await listSkills(sc)).find(x => x.id === skillId) ?? null : null; })() : null;
  if (skillId && !skillMeta) return NextResponse.json({ error: 'invalid', message: `${skillId} is not a skill of ${product}` }, { status: 422 });
  if (skillId && !(body.instruction ?? '').trim()) body.instruction = `Run "${skillMeta!.title}" on ${(body.refs ?? [])[0] ?? 'the product'}.`;
  const role = body.pr === true || body.role === 'librarian' || remember || (skillMeta && skillMeta.role !== 'worker') ? 'librarian' : 'worker';
  if (skillMeta?.role === 'worker') { body.agent = body.agent ?? 'claude-code'; body.mode = 'chat'; body.cwd = body.cwd?.trim() || REPO_ROOT; }
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
  const s = await createSession(p.dir, product, { agent, instruction: instruction || '(image)', refs: (body.refs ?? []).filter(r => typeof r === 'string').slice(0, 50), source: body.source ?? {}, mode, cwd: cwd || undefined, images, role, skills: [...(remember ? ['skill:remember'] : []), ...(skillId ? [skillId] : []), ...(body.skills ?? []).filter(x => /^skill:[A-Za-z0-9_.\-]+$/.test(x))], hooks: (body.hooks ?? []).filter(x => /^hook:[A-Za-z0-9_.\-]+$/.test(x)) });
  // a request has its page before the first message names it (rule:pr-doc); an ad-hoc conversation and a queued run have none
  const wfUrl = new URL(req.url).origin;
  if (remember || skillId) { const started = await startChat(p.dir, product, s.id, { wfUrl }); return NextResponse.json(started ?? s, { status: 201 }); }
  if (role === 'librarian') {
    // `prRef`: refine an existing PR (its page stays; the message row on the PR head) instead of making a page
    const existing = body.prRef && (await readPrDoc(product, body.prRef)) ? body.prRef : null;
    if (existing) { await setPrDoc(p.dir, s.id, existing, `refines ${existing}`); s.prDoc = existing; await setRefining(p.dir, product, existing); }
    else {
      // no goal attached: the goal first, then the PR part of it, then the agent on it (decision:wf2.pr-has-a-goal)
      if (!s.refs.some(r => r.startsWith('goal:'))) { const goal = await goalForRequest(product, s); if (goal) { await addRefs(p.dir, s.id, [goal]); s.refs = [goal, ...s.refs]; } }
      s.prDoc = (await createPrDoc(p.dir, product, s)) ?? undefined;
    }
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
