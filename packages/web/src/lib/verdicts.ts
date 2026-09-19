// The write-time verdict pass in the app (decision:memory.write-time-verdict, req:memory.verdicts): after a rebuild,
// every decision, requirement, rule or constraint that is new or changed is classified against its neighbours by the
// judge (lib/judge.js, through the agent CLI — decision:memory.model-calls-via-cli); a verdict that is not
// "consistent" is written under the node as its content — a verdict: line and, for duplicate / contradicts, an open
// contradiction: line — so it reaches the Inbox with the block. Consistent verdicts stay in the judge log
// (_build/verdicts.json) and show as "checked against n". Off unless the product's _product.md says `verdicts: on`
// or WF_VERDICTS=1; budgeted per run; one run at a time per product, ids arriving meanwhile wait for the next.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { loadGraph } from './load';
import { writeAtomic, withFileLock } from './write';
import { readContent, writeContent } from './node-content';
import type { BlockChange } from './session-types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const lib = () => ({ Graph: req('./lib/graph.js').Graph as any, judge: req('./lib/judge.js') as { judgePairs: (pairs: any[], o: any) => Promise<any[]>; verdictLines: (v: any, o: { product: string }) => string[] } });

export type Verdict = { a: string; b: string; kind: 'duplicate' | 'refines' | 'consistent' | 'contradicts'; conflict: 'static' | 'dynamic' | 'conditional' | null; reason: string; model: string; prompt: string; at: string; key: string; cached?: boolean };
const JUDGED = /^(decision|req|rule|constraint):/;

type State = { running: Set<string>; waiting: Map<string, Set<string>> };
const g = globalThis as unknown as { __wfVerdicts?: State };
const st = (): State => (g.__wfVerdicts ??= { running: new Set(), waiting: new Map() });

// `verdicts: on` in the product's _product.md, or WF_VERDICTS=1
export async function verdictsEnabled(productDir: string): Promise<boolean> {
  if (process.env.WF_VERDICTS === '1') return true;
  if (process.env.WF_VERDICTS === '0') return false;
  try { const md = await readFile(path.join(productDir, '_product.md'), 'utf8'); return /^verdicts:\s*(on|true|yes)\s*$/m.test(md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''); } catch { return false; }
}

// The judge log for a product: every verdict ever given, keyed by pair
export async function verdictLog(productDir: string): Promise<Verdict[]> {
  try { const c = JSON.parse(await readFile(path.join(productDir, '_build/verdicts.json'), 'utf8')) as { entries: Record<string, Omit<Verdict, 'key'>> }; return Object.entries(c.entries ?? {}).map(([key, v]) => ({ ...v, key })); } catch { return []; }
}

// Called by the watcher with the rebuild's diff: schedule the pass for the judged kinds among the added / changed nodes.
export function scheduleVerdicts(productDir: string, product: string, changes: BlockChange[], log: (m: string) => void = () => {}) {
  const ids = changes.filter(c => c.change !== 'removed' && JUDGED.test(c.id)).map(c => c.id);
  if (!ids.length) return;
  const s = st(); if (!s.waiting.has(productDir)) s.waiting.set(productDir, new Set());
  for (const id of ids) s.waiting.get(productDir)!.add(id);
  void drain(productDir, product, log);
}
async function drain(productDir: string, product: string, log: (m: string) => void) {
  const s = st(); if (s.running.has(productDir)) return;
  if (!(await verdictsEnabled(productDir))) { s.waiting.get(productDir)?.clear(); return; }
  s.running.add(productDir);
  try {
    while (s.waiting.get(productDir)?.size) {
      const ids = [...s.waiting.get(productDir)!]; s.waiting.get(productDir)!.clear();
      try { const r = await runVerdicts(productDir, product, ids, { log }); if (r.written) log(`verdicts: ${r.judged} pair(s) judged for ${ids.length} node(s), ${r.written} line(s) written`); } catch (e) { log(`verdicts: ${e instanceof Error ? e.message : e}`); }
    }
  } finally { s.running.delete(productDir); }
}

// The pass for given node ids: pairs → verdicts (cached, budgeted) → lines under each node that has none for them yet.
export async function runVerdicts(productDir: string, product: string, ids: string[], opts: { budget?: { pairs: number; calls: number }; limit?: number; log?: (m: string) => void } = {}): Promise<{ judged: number; written: number; verdicts: Verdict[] }> {
  const { Graph, judge } = lib();
  const graph = new Graph(await loadGraph(path.join(productDir, '_build/graph.json')));
  const pairs = graph.verdictPairs(ids, { limit: opts.limit ?? 12 });
  if (!pairs.length) return { judged: 0, written: 0, verdicts: [] };
  const verdicts = (await judge.judgePairs(pairs, { cacheFile: path.join(productDir, '_build/verdicts.json'), budget: opts.budget ?? { pairs: 30, calls: 4 }, log: opts.log ?? (() => {}) })).filter(Boolean) as Verdict[];
  let written = 0;
  const byNode = new Map<string, Verdict[]>();
  for (const v of verdicts) { if (v.kind === 'consistent') continue; if (!byNode.has(v.b)) byNode.set(v.b, []); byNode.get(v.b)!.push(v); }
  for (const [id, vs] of byNode) {
    const n = graph.byId.get(id); if (!n || !n.file || n.form === 'block') continue;
    const file = path.join(REPO_ROOT, n.file);
    written += await withFileLock(file, async () => {
      const md = await readFile(file, 'utf8');
      const content = readContent(md, id, n.line, n.form ?? 'yaml'); if (content === null) return 0;
      const fresh = vs.flatMap(v => judge.verdictLines(v, { product })).filter(l => !content.includes(l.split(' ')[0]));
      if (!fresh.length) return 0;
      const next = writeContent(md, id, n.line, n.form ?? 'yaml', [content.trim(), ...fresh].filter(Boolean).join('\n\n'));
      if (!next || next === md) return 0;
      await writeAtomic(file, next);
      return fresh.length;
    });
  }
  return { judged: verdicts.length, written, verdicts };
}
