// The cleanup list (req:waterfall.card-quality.cleanup): the requirements and decisions a vault already holds that are
// trivial (constraint:waterfall.no-trivial-cards) or say what another card says, each with the reason, for the person to
// drop together. Duplicates: the vault search finds the close pairs (lib/propose-card DUP_NEAR) and the pair judge
// (lib/judge) confirms them; trivial: the worth judge applies the bar every prompt carries. Both are cached by the
// judge, the list itself in the cache folder's cleanup.json. Nothing is dropped until the person ticks it.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO_ROOT, cacheDirOf } from './products';
import { search } from './semantic';
import { DUP_NEAR } from './propose-card';
import { editNode } from './node-edit';
import type { Scope } from './scope';
import type { GraphNode } from './graph';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const judge = () => req('./lib/judge.js') as { nodeText: (n: any) => string; judgePairs: (p: any[], o: any) => Promise<any[]>; judgeWorth: (c: any[], o: any) => Promise<any[]> };

export type CleanupItem = { id: string; title: string; status: string; kind: string; why: 'trivial' | 'duplicate'; reason: string; of?: string; file: string; line: number };
export type Cleanup = { at: string; scanned: number; items: CleanupItem[]; unjudged: number };

const CARD = /^(req|decision):/;
const LIVE = new Set(['proposed', 'approved', '']);
const file = (dir: string) => path.join(cacheDirOf(dir), 'cleanup.json');

// Of two cards that say the same, the one to drop: a proposed one before an approved one, then the one fewer blocks
// link to, then the later one (by file and line) — the older, better-linked, approved card stays.
export function pickDrop(a: { id: string; status: string; links: number; file: string; line: number }, b: typeof a): typeof a {
  const ap = a.status === 'approved', bp = b.status === 'approved';
  if (ap !== bp) return ap ? b : a;
  if (a.links !== b.links) return a.links < b.links ? a : b;
  return a.file === b.file ? (a.line > b.line ? a : b) : (a.file > b.file ? a : b);
}

export async function readCleanup(dir: string): Promise<Cleanup | null> {
  try { return JSON.parse(await readFile(file(dir), 'utf8')) as Cleanup; } catch { return null; }
}

export async function scanCleanup(scope: Scope, log: (m: string) => void = () => {}): Promise<Cleanup> {
  const { nodeText, judgePairs, judgeWorth } = judge();
  const dir = scope.product.dir;
  const cards = scope.graph.nodes.filter(n => n.defined && CARD.test(n.id) && LIVE.has(n.status ?? '') && !n.archived) as GraphNode[];
  const byId = new Map(cards.map(n => [n.id, n]));
  const links = (id: string) => (scope.idx.inc.get(id) ?? []).filter(e => e.verb !== 'mentions').length;
  const info = (n: GraphNode) => ({ id: n.id, status: n.status ?? '', links: links(n.id), file: n.file, line: n.line });
  // close pairs among the cards, each once
  const pairs = new Map<string, { a: GraphNode; b: GraphNode }>();
  for (const n of cards) {
    const hits = await search(dir, scope.graph, `${n.title} — ${nodeText(n)}`.slice(0, 1200), { limit: 5 }).catch(() => []);
    for (const h of hits) { const m = byId.get(h.id); if (!m || m.id === n.id || h.score < DUP_NEAR) continue; const k = [n.id, m.id].sort().join('|'); if (!pairs.has(k)) pairs.set(k, { a: n, b: m }); }
  }
  log(`cleanup: ${cards.length} cards, ${pairs.size} close pairs`);
  const cacheFile = path.join(cacheDirOf(dir), 'verdicts.json');
  const asCard = (n: GraphNode) => ({ id: n.id, text: nodeText(n), status: n.status });
  const pv = await judgePairs([...pairs.values()].map(p => ({ a: asCard(p.a), b: asCard(p.b) })), { cacheFile, budget: { pairs: 200, calls: 20 }, log });
  const items: CleanupItem[] = []; const dropped = new Set<string>();
  [...pairs.values()].forEach((p, i) => {
    const v = pv[i]; if (v?.kind !== 'duplicate') return;
    const drop = pickDrop(info(p.a), info(p.b)); const keep = drop.id === p.a.id ? p.b : p.a;
    if (dropped.has(drop.id) || dropped.has(keep.id)) return; dropped.add(drop.id);
    const n = byId.get(drop.id)!;
    items.push({ id: n.id, title: n.title, status: n.status ?? '', kind: n.kind, why: 'duplicate', of: keep.id, reason: v.reason ?? '', file: n.file, line: n.line });
  });
  const wv = await judgeWorth(cards.map(asCard), { cacheFile, log });
  const unjudged = pv.filter(v => !v).length + wv.filter(v => !v).length;
  cards.forEach((n, i) => {
    const v = wv[i]; if (!v || v.verdict === 'keep' || dropped.has(n.id)) return;
    // a copy the worth judge saw in its batch that the search missed; one whose other card is not a live card is not listed
    if (v.verdict === 'duplicate') {
      const m = v.of ? byId.get(v.of) : undefined; if (!m || dropped.has(m.id)) return;
      // the judge names the fuller card as the one that stays; only an approved card is kept over its judgement
      const d = (n.status === 'approved') !== (m.status === 'approved') ? byId.get(pickDrop(info(n), info(m)).id)! : n; const keep = d.id === n.id ? m : n; if (dropped.has(d.id)) return;
      dropped.add(d.id); items.push({ id: d.id, title: d.title, status: d.status ?? '', kind: d.kind, why: 'duplicate', of: keep.id, reason: v.reason ?? '', file: d.file, line: d.line }); return;
    }
    items.push({ id: n.id, title: n.title, status: n.status ?? '', kind: n.kind, why: 'trivial', reason: v.reason ?? '', file: n.file, line: n.line });
  });
  const out: Cleanup = { at: new Date().toISOString(), scanned: cards.length, items, unjudged };
  await mkdir(path.dirname(file(dir)), { recursive: true }); await writeFile(file(dir), JSON.stringify(out, null, 2));
  return out;
}

// The ticked items dropped: a proposed card is rejected; an approved duplicate is superseded by the card it repeats; an
// approved trivial card is rejected. Each is an ordinary status change with its change record, so Undo puts it back.
export async function applyCleanup(scope: Scope, ids: string[]): Promise<{ done: string[]; failed: { id: string; message: string }[] }> {
  const list = await readCleanup(scope.product.dir); const byId = new Map((list?.items ?? []).map(i => [i.id, i]));
  const done: string[] = []; const failed: { id: string; message: string }[] = [];
  for (const id of ids) {
    const it = byId.get(id); if (!it) { failed.push({ id, message: 'not on the cleanup list' }); continue; }
    const patch = it.status === 'approved' && it.why === 'duplicate' && it.of ? { status: 'superseded', props: { 'superseded-by': it.of } } : { status: 'rejected' };
    const r = await editNode(scope, id, patch);
    if (r.ok) done.push(id); else failed.push({ id, message: r.message });
  }
  if (list) { const gone = new Set(done); await writeFile(file(scope.product.dir), JSON.stringify({ ...list, items: list.items.filter(i => !gone.has(i.id)) }, null, 2)); }
  return { done, failed };
}
