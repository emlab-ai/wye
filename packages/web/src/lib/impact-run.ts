// The impact run (decision:exec.impact-run, decision:exec.impact-trigger, decision:exec.impact-through-the-judge):
// a change record gets an impact set — candidates from structure (lib/impact.js: content first, two hops with
// decay and paths) and from text (the semantic hits structure did not reach, "by text") — and, when the product's
// `impact:` is `auto` (or the person asks), a verdict per candidate from the model: unaffected | update (a patch with
// old and new) | rework (a task on the Work view) | contradicts (an open contradiction) | ask (a question block).
// The run is asynchronous and stored on the record as it fills in; at most one run per node is in flight, a further
// edit restarts it. `manual` keeps the candidates and skips the model; `off` (the default) does nothing.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, getProduct } from './products';
import { loadGraph } from './load';
import { loadScope } from './scope';
import { search } from './semantic';
import { getChange, mutateChange, claimWrite, saveChange, valueHash, nodeValue, type ChangeRecord, type NodeValue } from './changes';
import { editNode } from './node-edit';
import { writeAtomic, withFileLock } from './write';
import { readContent, writeContent } from './node-content';
import { captureTask } from './work-io';
import { scheduleVerdicts } from './verdicts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const lib = () => ({ Graph: req('./lib/graph.js').Graph as any, impact: req('./lib/impact.js') as any, judge: req('./lib/judge.js') as { nodeText: (n: any) => string } });

export type ImpactVerdict = 'unaffected' | 'update' | 'rework' | 'contradicts' | 'ask';
export type ImpactCandidate = { id: string; kind: string; title: string; status?: string; path: string; via: 'content' | 'structure' | 'text'; weight: number; text: string; hash: string; verdict?: ImpactVerdict; reason?: string; update?: { text?: string; props?: Record<string, string> }; question?: string; cached?: boolean; outcome?: { state: 'applied' | 'skipped' | 'task' | 'contradiction' | 'question'; ref?: string; by?: string; at?: string; reason?: string } };
export type ImpactSet = { at: string; status: 'candidates' | 'running' | 'done' | 'off' | 'failed'; mode: 'auto' | 'manual' | 'off'; candidates: ImpactCandidate[]; pending: number; model?: string; error?: string };

// `impact: auto | manual | off` in _product.md (WF_IMPACT overrides); `impact-budget: n` candidates per run
export async function impactMode(productDir: string): Promise<'auto' | 'manual' | 'off'> {
  const env = process.env.WF_IMPACT; if (env === 'auto' || env === 'manual' || env === 'off') return env;
  try { const md = await readFile(path.join(productDir, '_product.md'), 'utf8'); const m = md.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^impact:\s*(auto|manual|off|on)\s*$/m); return m ? (m[1] === 'on' ? 'auto' : m[1] as 'auto' | 'manual' | 'off') : 'off'; } catch { return 'off'; }
}
async function impactBudget(productDir: string): Promise<number> {
  try { const md = await readFile(path.join(productDir, '_product.md'), 'utf8'); const m = md.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^impact-budget:\s*(\d+)\s*$/m); return m ? Number(m[1]) : 20; } catch { return 20; }
}

type State = { running: Map<string, string>; rerun: Set<string> };   // running: node → change id
const g = globalThis as unknown as { __wfImpact?: State };
const st = (): State => (g.__wfImpact ??= { running: new Map(), rerun: new Set() });

// The candidates of a change (req:exec.impact-set, req:exec.impact-sub-items): structure from lib/impact.js on the
// built graph, then the text hits structure did not reach. Each carries the hash of its current text so a patch
// can tell when the candidate moved on (req:exec.impact-patch).
export async function candidatesFor(productDir: string, product: string, node: string, afterText: string): Promise<ImpactCandidate[]> {
  const { Graph, impact, judge } = lib();
  const graph = new Graph(await loadGraph(path.join(productDir, '_build/graph.json')));
  const cands: ImpactCandidate[] = impact.structuralCandidates(graph, node).map((c: any) => ({ ...c, hash: hashText(c.text) }));
  try {
    const have = new Set(cands.map(c => c.id));
    const scope = await loadScope(product);
    if (scope) for (const h of await search(productDir, scope.graph, afterText, { limit: 8 })) {
      const n = graph.byId.get(h.id); if (!n || have.has(h.id) || h.id === node || n.kind === 'block' || !n.defined || h.score < 0.45) continue;
      cands.push({ id: n.id, kind: n.kind, title: n.title, status: n.status, path: '', via: 'text', weight: Math.round(h.score * 100) / 100, text: judge.nodeText(n), hash: hashText(judge.nodeText(n)) });
    }
  } catch { /* no embeddings yet: structure only */ }
  return cands;
}
const hashText = (t: string) => valueHash({ text: t, textKey: 'text', status: '', props: {}, body: '', title: '' });
// A value as the judge reads it: the text, then the prose keys and whatever else changed — the twin of
// lib/judge.js#nodeText over a change record's before / after
const PROSE = ['statement', 'when', 'then', 'unless', 'choice', 'context', 'q', 'description', 'purpose'];
export function valueText(v: NodeValue, changed: string[] = []): string {
  const keys = [...PROSE, ...changed.filter(k => k !== 'text' && k !== 'status' && !PROSE.includes(k))];
  return [v.text, ...keys.filter(k => v.props[k]).map(k => `${k}: ${v.props[k]}`)].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 1500);
}

// Called by the watcher with the records a rebuild produced: an impact run for each pending one that is not a
// tracking-only change and has something to reach.
export function scheduleImpact(productDir: string, product: string, records: ChangeRecord[], log: (m: string) => void = () => {}): void {
  for (const r of records) {
    if (r.state !== 'pending' || r.tracking) continue;
    void runImpact(productDir, product, r.id, { log }).catch(e => log(`impact: ${e instanceof Error ? e.message : e}`));
  }
}

// The run for one change record: candidates first (the card shows them at once), then — in auto mode or on demand —
// the verdicts, batch by batch, stored as they land. A run already in flight for the node is restarted after.
export async function runImpact(productDir: string, product: string, changeId: string, opts: { force?: boolean; log?: (m: string) => void } = {}): Promise<ImpactSet | null> {
  const log = opts.log ?? (() => {});
  const r = await getChange(productDir, changeId); if (!r) return null;
  const mode = await impactMode(productDir);
  if (mode === 'off' && !opts.force) return null;
  const s = st();
  if (s.running.has(r.node)) { s.rerun.add(r.node); return r.impact as ImpactSet ?? null; }
  s.running.set(r.node, changeId);
  try {
    const beforeText = valueText(r.before, r.changed), afterText = valueText(r.after, r.changed);
    const cands = await candidatesFor(productDir, product, r.node, afterText);
    // verbatim repeats in the node's content are updates without a call (req:exec.impact-sub-items): the changed
    // text or property value, found word for word in a child
    const { impact } = lib();
    for (const c of cands) {
      if (c.via !== 'content') continue;
      for (const k of r.changed) { const a = k === 'text' ? r.before.text : r.before.props[k], b = k === 'text' ? r.after.text : r.after.props[k]; const t = a && b ? impact.verbatimUpdate(c.text, a, b) : null; if (t) { c.verdict = 'update'; c.reason = `repeats the old ${k === 'text' ? 'text' : k} verbatim`; c.update = { text: t }; break; } }
    }
    const judge = mode === 'auto' || opts.force;
    let set: ImpactSet = { at: new Date().toISOString(), status: !cands.length ? 'done' : judge ? 'running' : 'candidates', mode, candidates: cands, pending: judge ? cands.filter(c => !c.verdict).length : 0 };
    await mutateChange(productDir, changeId, c => { c.impact = set; });
    if (!judge || !cands.length) return set;
    const todo = cands.map((c, i) => [c, i] as const).filter(([c]) => !c.verdict);
    const change = { node: r.node, kind: r.kind, before: beforeText, after: afterText };
    const budget = { candidates: await impactBudget(productDir), calls: 3 };
    const verdicts = await impact.judgeImpact(change, todo.map(([c]) => c), { cacheFile: path.join(productDir, '_build/impact.json'), budget, log, onBatch: async (landed: { i: number; v: any }[]) => {
      for (const { i, v } of landed) { const c = cands[todo[i][1]]; c.verdict = v.verdict; c.reason = v.reason; c.update = v.update ?? undefined; c.question = v.question ?? undefined; c.cached = v.cached; }
      set = { ...set, candidates: cands, pending: cands.filter(c => !c.verdict).length, model: landed[0]?.v.model };
      await mutateChange(productDir, changeId, c => { c.impact = set; });
    } });
    const judged = verdicts.filter(Boolean).length;
    set = { ...set, status: 'done', pending: cands.filter(c => !c.verdict).length };
    await mutateChange(productDir, changeId, c => { c.impact = set; });
    await landOutcomes(productDir, product, changeId);
    log(`impact: ${judged} candidate(s) judged for ${r.node}`);
    return set;
  } catch (e) {
    await mutateChange(productDir, changeId, c => { c.impact = { ...(c.impact as ImpactSet ?? { at: new Date().toISOString(), mode, candidates: [], pending: 0 }), status: 'failed', error: e instanceof Error ? e.message : String(e) }; });
    throw e;
  } finally {
    s.running.delete(r.node);
    if (s.rerun.delete(r.node)) { const latest = await getChange(productDir, changeId); if (latest) void runImpact(productDir, product, changeId, opts).catch(() => {}); }
  }
}

// Outcomes that land on their own once the run is done (req:exec.impact-rework, req:exec.impact-contradiction,
// decision:exec.impact-run "ask"): a rework becomes an unassigned task on the Work view, a contradicts an open
// contradiction line under the changed node, an ask a question block there. Updates wait for Apply (req:exec.impact-patch).
export async function landOutcomes(productDir: string, product: string, changeId: string): Promise<void> {
  const r = await getChange(productDir, changeId); const set = r?.impact as ImpactSet | undefined; if (!r || !set) return;
  const scope = await loadScope(product); if (!scope) return;
  const n = scope.idx.byId.get(r.node);
  for (const c of set.candidates) {
    if (c.outcome) continue;
    if (c.verdict === 'rework') {
      const t = await captureTask(scope, { text: `Follow up on ${c.id} after ${r.node} changed: ${c.reason ?? 'rework'}`, partOf: c.id, project: docProject(r.file), by: 'wye:impact' });
      if (t.ok) { await editNode(scope, t.id, { props: { change: changeId } }).catch(() => undefined); c.outcome = { state: 'task', ref: t.id, at: new Date().toISOString() }; }
    } else if ((c.verdict === 'contradicts' || c.verdict === 'ask') && n?.defined && n.form !== 'block') {
      const key = `${changeId.slice(0, 6)}${c.id.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase()}`;
      const line = c.verdict === 'contradicts'
        ? `contradiction:${product}.${key} ${r.node} contradicts ${c.id} — ${c.reason ?? 'the new value and the candidate cannot both hold'} #open (between: ${r.node} ${c.id}, conflict: static, change: ${changeId})`
        : `question:${product}.${key} ${(c.question ?? c.reason ?? 'what does the change mean here').replace(/[()#]/g, ' ').trim()} #open (context: impact of the change ${changeId} on ${c.id}, related-to: ${c.id})`;
      const ok = await appendUnder(n, line);
      if (ok) c.outcome = { state: c.verdict === 'contradicts' ? 'contradiction' : 'question', ref: line.split(' ')[0], at: new Date().toISOString() };
    }
  }
  await mutateChange(productDir, changeId, ch => { ch.impact = set; });
}
const docProject = (file: string) => file.match(/projects\/([^/]+)\/docs\//)?.[1];
async function appendUnder(n: { id: string; file: string; line: number; form?: string }, line: string): Promise<boolean> {
  const abs = path.join(REPO_ROOT, n.file);
  return withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    const content = readContent(md, n.id, n.line, n.form ?? 'yaml'); if (content === null) return false;
    if (content.includes(line.split(' ')[0])) return true;
    const next = writeContent(md, n.id, n.line, n.form ?? 'yaml', [content.trim(), line].filter(Boolean).join('\n\n'));
    if (!next || next === md) return false;
    await writeAtomic(abs, next); return true;
  });
}

// Apply a proposed update (req:exec.impact-patch): refused when the candidate moved on since the run (its hash
// differs) — the run is redone for it; else written through the writer, recorded as a change accepted by the
// person, and the verdict pass re-runs on the candidate when it is a judged kind.
export async function applyPatch(productDir: string, product: string, changeId: string, candId: string, opts: { text?: string; props?: Record<string, string>; by?: string; force?: boolean }): Promise<{ ok: true; line: string } | { ok: false; error: 'not_found' | 'stale' | 'invalid'; message: string }> {
  const r = await getChange(productDir, changeId); const set = r?.impact as ImpactSet | undefined; if (!r || !set) return { ok: false, error: 'not_found', message: 'no impact run on this change' };
  const c = set.candidates.find(x => x.id === candId); if (!c || c.verdict !== 'update') return { ok: false, error: 'not_found', message: `${candId} is not an update candidate` };
  const scope = await loadScope(product); if (!scope) return { ok: false, error: 'not_found', message: 'product not found' };
  const n = scope.idx.byId.get(candId); if (!n?.defined) return { ok: false, error: 'not_found', message: `${candId} is no longer defined` };
  const { judge } = lib();
  if (hashText(judge.nodeText(n)) !== c.hash && !opts.force) return { ok: false, error: 'stale', message: `${candId} changed since the run — the patch is stale; run impact again` };
  const text = opts.text ?? c.update?.text; const props = opts.props ?? c.update?.props;
  if (!text && !props) return { ok: false, error: 'invalid', message: 'nothing to apply' };
  const by = opts.by || 'person';
  const before = nodeValue(n);
  claimWrite(candId, { by, silent: true });
  const w = await editNode(scope, candId, { ...(text ? (before.textKey === 'title' ? { props: { title: text, ...(props ?? {}) } } : { text, ...(props ? { props } : {}) }) : { props }) });
  if (!w.ok) return { ok: false, error: 'invalid', message: w.message };
  const now = new Date().toISOString();
  const fresh = (await loadScope(product))?.idx.byId.get(candId);
  const after = fresh ? nodeValue(fresh) : { ...before, text: text ?? before.text };
  await saveChange(productDir, { id: Math.random().toString(36).slice(2, 12), product, node: candId, kind: n.kind, doc: r.doc, file: n.file, line: n.line, before, after, changed: [...(text ? ['text'] : []), ...Object.keys(props ?? {})], by, at: now, updatedAt: now, state: 'accepted', acceptedBy: by, acceptedAt: now, revertOf: undefined, impact: undefined });
  await mutateChange(productDir, changeId, ch => { const cc = (ch.impact as ImpactSet).candidates.find(x => x.id === candId); if (cc) cc.outcome = { state: 'applied', by, at: now }; });
  if (/^(decision|req|rule|constraint):/.test(candId)) scheduleVerdicts(productDir, product, [{ id: candId, change: 'changed', doc: r.doc, title: n.title, at: now }]);
  return { ok: true, line: w.line };
}
export async function skipPatch(productDir: string, changeId: string, candId: string, by: string, reason?: string): Promise<boolean> {
  return (await mutateChange(productDir, changeId, ch => { const cc = (ch.impact as ImpactSet | undefined)?.candidates.find(x => x.id === candId); if (!cc) return false; cc.outcome = { state: 'skipped', by, at: new Date().toISOString(), reason }; return true; })) ?? false;
}

// An agent's what-if (req:exec.impact-for-agents): the candidates for `id` with `after` as the new text, judged now
// (the model waits within the budget), nothing written.
export async function whatIf(product: string, id: string, after: string, opts: { judge?: boolean } = {}): Promise<{ candidates: ImpactCandidate[] } | null> {
  const p = await getProduct(product); if (!p) return null;
  const scope = await loadScope(product); const n = scope?.idx.byId.get(id); if (!scope || !n?.defined) return null;
  const { impact, judge } = lib();
  const cands = await candidatesFor(p.dir, product, id, after);
  if (opts.judge === false) return { candidates: cands };
  const before = judge.nodeText(n);
  const verdicts = await impact.judgeImpact({ node: id, kind: n.kind, before, after }, cands, { cacheFile: path.join(p.dir, '_build/impact.json'), budget: { candidates: await impactBudget(p.dir), calls: 3 } });
  cands.forEach((c, i) => { const v = verdicts[i]; if (v) { c.verdict = v.verdict; c.reason = v.reason; c.update = v.update ?? undefined; c.question = v.question ?? undefined; c.cached = v.cached; } });
  return { candidates: cands };
}
