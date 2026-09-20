// A PR's scope (decision:wf2.pr-scheduler): the ids its build will touch — the Definition's blocks, the ids the
// request tags, and what lib/impact's structural candidates reach from those (two hops with decay, weight ≥ 0.5).
// Written to the frontmatter as `scope: [..]` with `scope-of: <hash of the Definition ids>` so readiness can tell
// whether it is fresh; two PRs overlap when their scopes intersect — the dispatcher never builds them at once.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from './products';
import type { GraphData } from './graph';
import { definitionIds, sectionBody, getFrontmatter, setFrontmatter } from './pr-doc';
import { writeAtomic, withFileLock, rebuild } from './write';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const lib = () => ({ Graph: req('./lib/graph.js').Graph as any, impact: req('./lib/impact.js') as any });

const OUT = /^(pr|session|block|module|verdict|contradiction|prop|field):/;
export const SCOPE_MIN = 0.5;

export const scopeHash = (defIds: string[]) => createHash('sha1').update([...defIds].sort().join('\n')).digest('hex').slice(0, 8);

// The ids the Request section tags (kind:slug in prose), the PR's own ids left out.
export function requestIds(md: string): string[] {
  const sec = sectionBody(md, 'Request') ?? '';
  return [...new Set((sec.match(/\b[a-z][a-z-]*:[A-Za-z0-9_][A-Za-z0-9_.\-]*\b/g) ?? []).filter(id => !OUT.test(id) && !/^https?:/.test(id)))];
}

// The scope from the page and the graph (pure apart from lib/impact's walk over the built graph).
export function scopeIds(graph: GraphData, md: string, opts: { hops?: number; min?: number; cap?: number } = {}): string[] {
  const { Graph, impact } = lib();
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const seeds = [...new Set([...definitionIds(md), ...requestIds(md)])].filter(id => byId.get(id)?.defined && !OUT.test(id));
  const out = new Set(seeds);
  try {
    const g = new Graph(graph);
    for (const id of seeds.slice(0, 20)) for (const c of impact.structuralCandidates(g, id, { hops: opts.hops ?? 2, min: opts.min ?? SCOPE_MIN })) if (!OUT.test(c.id)) out.add(c.id);
  } catch { /* the seeds alone */ }
  return [...out].slice(0, opts.cap ?? 60);
}

export const overlap = (a: string[], b: string[]): string[] => { const s = new Set(b); return a.filter(id => s.has(id)); };
export function conflicts(me: { ref: string; scope: string[] }, others: { ref: string; num: number | null; scope: string[] }[]): { ref: string; num: number | null; shared: string[] }[] {
  return others.filter(o => o.ref !== me.ref).map(o => ({ ref: o.ref, num: o.num, shared: overlap(me.scope, o.scope) })).filter(c => c.shared.length);
}

// `scope: [a, b]` and `scope-of: <hash>` from the frontmatter.
export function parseScope(md: string): { scope: string[]; of: string } {
  const raw = getFrontmatter(md, 'scope') ?? '';
  return { scope: raw.replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean), of: getFrontmatter(md, 'scope-of') ?? '' };
}
export const scopeFresh = (md: string) => parseScope(md).of === scopeHash(definitionIds(md));
export function withScope(md: string, scope: string[]): string {
  return setFrontmatter(setFrontmatter(md, 'scope', `[${scope.join(', ')}]`), 'scope-of', scopeHash(definitionIds(md)));
}

// Recompute and write a PR's scope (the page's absolute file); returns it. Called after intake and whenever the
// Definition changes; rebuilds only when something moved.
export async function refreshScope(productDir: string, graph: GraphData, file: string): Promise<string[]> {
  let scope: string[] = []; let moved = false;
  await withFileLock(file, async () => { let md: string; try { md = await readFile(file, 'utf8'); } catch { return; } scope = scopeIds(graph, md); const next = withScope(md, scope); if (next !== md) { await writeAtomic(file, next); moved = true; } });
  if (moved) await rebuild(productDir);
  return scope;
}
