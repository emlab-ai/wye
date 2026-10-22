// Ask's query plan (decision:waterfall.ask-plans-over-the-ontology, plan:ask-query-plan): opt-in, when the caller sets
// rounds or hops (decision:waterfall.ask-plan-is-opt-in) — else the graph step (graphq) runs as before.
//   ontology  what the planner knows of the vault: each kind in use, what one instance is, its props, which carry time
//             and which link to what
//   plan      one tool-less model call per round: the answer's shape, the entities, kinds, props and time it is about,
//             and SQL (or SQL/PGQ MATCH) over the nodes and edges tables of lib/query
//   rounds    plan → run → plan again on what the rows left missing, up to `rounds`, stopping when a round adds nothing
// The rows only add to what the search found; a plan never removes a hit. A query that fails is said in the steps;
// when no query of the first round runs, the graph step's own queries are used instead.
import type { GraphIndex, GraphNode, TypeDef } from '../graph';
import { HIDDEN_KINDS, isCurrent } from '../graph';
import { spawnClaude } from './claude';
import { entitiesIn, runQuery as walk, timeOf, graphFind, PLAN_MODEL, type Found } from './graphq';

const NOT_ENTITIES = new Set(['type', 'module', 'skill', 'hook', 'task', 'step', 'workflow', 'stage', 'agent', 'project', 'product', 'comment', 'text']);
const usable = (n: GraphNode | undefined): n is GraphNode => !!n && !HIDDEN_KINDS.has(n.kind) && !n.archived && isCurrent(n);
export const MAX_HOPS = 4, MAX_ROUNDS = 5;

// the kinds in use, each with its purpose and props: a prop is a column; one whose value is another node is also an
// edge (verb = the prop's name, from the card to that node); a date prop carries the card's time
export function ontology(idx: GraphIndex, types: TypeDef[] = []): string {
  const count = new Map<string, number>();
  for (const n of idx.byId.values()) if (usable(n) && !NOT_ENTITIES.has(n.kind)) count.set(n.kind, (count.get(n.kind) ?? 0) + 1);
  const bySlug = new Map(types.map(t => [t.slug, t]));
  const lines = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, c]) => {
    const t = bySlug.get(k);
    const props = (t?.props ?? []).filter(p => p.name !== 'id').map(p => `${p.name} (${p.ref ? `${p.many ? 'list of ' : ''}${p.ref.replace(/^type:/, '')}, a link` : p.type === 'date' ? 'date, its time' : p.type})`);
    return `- ${k} (${c})${t?.purpose ? ` — ${t.purpose.replace(/\s+/g, ' ').slice(0, 160)}` : ''}${props.length ? `\n  props: ${props.join(', ')}` : ''}`;
  });
  const verbs = new Map<string, number>();
  for (const es of idx.out.values()) for (const e of es) if (!e.generated) verbs.set(e.verb, (verbs.get(e.verb) ?? 0) + 1);
  let lo = '', hi = '';
  for (const n of idx.byId.values()) { if (!usable(n)) continue; const t = timeOf(n); if (t) { if (!lo || t[0] < lo) lo = t[0]; if (!hi || t[1] > hi) hi = t[1]; } }
  return `${lines.join('\n')}\nlinks in use: ${[...verbs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([v, c]) => `${v} (${c})`).join(', ')}${lo ? `\ntime covered: ${lo} .. ${hi}` : ''}`;
}

export type Shape = 'lookup' | 'when' | 'count' | 'list' | 'compare' | 'infer';
export interface PlanQuery { sql: string; why: string }
export interface Plan { shape?: Shape; entities: string[]; kinds: string[]; props: string[]; when?: { from?: string; to?: string }; queries: PlanQuery[]; done?: boolean }
export interface Ran { why: string; sql: string; rows: Record<string, unknown>[]; error?: string }

const SCHEMA = `nodes(id, kind, title, status, text, props JSON, and one column per prop with "-" as "_": date, starts, ends, since, until, participants …) — every value is text; a date is ISO (YYYY, YYYY-MM or YYYY-MM-DD), so it compares and sorts as a string; a list prop is "[a, b]" (has(cell, 'x') is true when it holds x); any other key is props->>'key'
edges(src, dst, verb) — every link, from the card that states it to what it links to (verb = the prop's name: participants, about, related-to …)`;

export function planPrompt(q: string, onto: string, entities: { id: string; title: string }[], ran: Ran[], round: number, o: { rounds: number; hops: number }): string {
  const last = round === o.rounds;
  return `You plan how to answer a question from a knowledge graph, the way a database plans a query. Reply with JSON only:
{"shape":"lookup|when|count|list|compare|infer","entities":[node ids],"kinds":[kinds],"props":[props],"when":{"from":"YYYY[-MM[-DD]]","to":"…"},"queries":[{"sql":"…","why":"what it finds"}],"done":false}
- Read the question against the types below: which kinds hold the answer, which props carry it, which link leads there, what time it is about.
- At most 4 queries, each one read-only DuckDB SQL over the tables below, returning the id of every node it finds (an \`id\` column, or ids in other columns) and the columns that answer (title, date …); LIMIT 50.
- A link is a join on edges; follow at most ${o.hops} link${o.hops > 1 ? 's' : ''} from an entity. Match words with ILIKE on title and text when no kind or prop says it.
- A count, an order, a first or a latest is computed in the SQL, not left to the reader.
- ${round === 1 ? 'This is the first round.' : `Round ${round} of ${o.rounds}: the queries so far and their rows are below. Ask only for what they leave missing — the other side of a link, the events around a date they give, a related entity. Set "done": true and no queries when they already answer the question.`}${last && round > 1 ? ' This is the last round.' : ''}

## Tables
${SCHEMA}

## Types in this vault
${onto}

## Entities named in the question
${entities.length ? entities.map(e => `- ${e.id} — ${e.title}`).join('\n') : '(none matched by name)'}
${ran.length ? `\n## Queries so far\n${ran.map(r => `- ${r.why}\n  ${r.sql.replace(/\s+/g, ' ')}\n  ${r.error ? `failed: ${r.error}` : `${r.rows.length} row(s)${r.rows.length ? `: ${rowsText(r.rows, 8)}` : ''}`}`).join('\n')}\n` : ''}
## Question
${q}`;
}

export function parsePlan(text: string): Plan | null {
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const strs = (v: unknown) => Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 12) : [];
    const shapes = ['lookup', 'when', 'count', 'list', 'compare', 'infer'];
    const w = j.when && typeof j.when === 'object' ? j.when as Record<string, unknown> : null;
    return {
      shape: shapes.includes(String(j.shape)) ? j.shape as Shape : undefined,
      entities: strs(j.entities), kinds: strs(j.kinds), props: strs(j.props),
      when: w && (w.from || w.to) ? { from: w.from ? String(w.from) : undefined, to: w.to ? String(w.to) : undefined } : undefined,
      queries: (Array.isArray(j.queries) ? j.queries : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { sql?: unknown }).sql === 'string')
        .slice(0, 4).map(x => ({ sql: String(x.sql), why: String(x.why ?? '').slice(0, 160) })),
      done: j.done === true,
    };
  } catch { return null; }
}

const cell = (v: unknown): string => typeof v === 'string' ? v : v == null ? '' : typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v, (_, x) => typeof x === 'bigint' ? String(x) : x);
export function rowsText(rows: Record<string, unknown>[], max = 20): string {
  return rows.slice(0, max).map(r => Object.entries(r).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${cell(v).slice(0, 120)}`).join(' | ')).join(' ; ');
}

// the nodes a query's rows name: every cell that is a node id (an id column, a src / dst, a list of ids)
export function idsIn(rows: Record<string, unknown>[], idx: GraphIndex): string[] {
  const out = new Set<string>();
  for (const r of rows) for (const v of Object.values(r)) {
    const s = cell(v); if (idx.byId.has(s)) { out.add(s); continue; }
    if (/^\[.*\]$/.test(s)) for (const x of s.slice(1, -1).split(',').map(t => t.trim().replace(/^["']|["']$/g, ''))) if (idx.byId.has(x)) out.add(x);
  }
  return [...out].filter(id => usable(idx.byId.get(id)));
}

export type RunSql = (sql: string) => Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string }>;
export type Planner = (prompt: string) => Promise<string>;

// lib/query, read-only, capped in rows and time (a query still running at the timeout is reported failed)
export function sqlRunner(product: string, o: { timeoutMs?: number; cap?: number } = {}): RunSql {
  return async sql => {
    const { runQuery } = await import('../query');
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<{ ok: false; status: number; message: string }>(r => { timer = setTimeout(() => r({ ok: false, status: 408, message: `no result in ${(o.timeoutMs ?? 5000) / 1000} s` }), o.timeoutMs ?? 5000); });
    const r = await Promise.race([runQuery(product, sql), late]); clearTimeout(timer);
    return r.ok ? { ok: true, rows: r.result.rows.slice(0, o.cap ?? 50) } : { ok: false, message: r.message };
  };
}

export function modelPlanner(o: { signal: AbortSignal; timeoutMs?: number }): Planner {
  return async prompt => {
    let text = '';
    for await (const l of spawnClaude(['-p', '--output-format', 'json', '--model', PLAN_MODEL, '--tools', ''], prompt, { signal: o.signal, timeoutMs: o.timeoutMs ?? 45000 })) if (l.type === 'result' && typeof l.result === 'string') text = l.result;
    return text;
  };
}

export interface PlanResult { found: Found[]; plan: Plan | null; ran: Ran[]; rounds: number; fallback: boolean }

// The whole step. `seen` are the node ids the search already has (the planner is told the entities, not those).
export async function planFind(idx: GraphIndex, q: string, o: { signal: AbortSignal; rounds?: number; hops?: number; types?: TypeDef[]; run: RunSql; planner: Planner; onStep?: (t: string) => void; seen?: string[] }): Promise<PlanResult> {
  const rounds = Math.min(MAX_ROUNDS, Math.max(1, o.rounds ?? 2)), hops = Math.min(MAX_HOPS, Math.max(1, o.hops ?? 2));
  const entities = entitiesIn(q, idx);
  const found = new Map<string, Found>();
  const add = (fs: Found[]) => { for (const f of fs) { const was = found.get(f.id); if (!was || was.score < f.score) found.set(f.id, f); } };
  // always: each named entity's neighbourhood, as far as the hops allow (the deterministic floor under any plan)
  for (const id of entities) add(walk(idx, { from: [id], hops: Math.min(2, hops), why: `linked to ${id}` }, 25));
  const onto = ontology(idx, o.types);
  const ran: Ran[] = []; let first: Plan | null = null; let done = 0; const reached = new Set<string>();
  for (let round = 1; round <= rounds && !o.signal.aborted; round++) {
    let plan: Plan | null = null;
    try { plan = parsePlan(await o.planner(planPrompt(q, onto, entities.map(id => ({ id, title: idx.byId.get(id)?.title ?? '' })), ran, round, { rounds, hops }))); } catch { plan = null; }
    if (o.signal.aborted) break;
    done = round;
    if (!plan) { o.onStep?.(`Plan: round ${round} gave no plan`); break; }
    if (round === 1) { first = plan; o.onStep?.(`Plan: ${[plan.shape, plan.kinds.join('|'), plan.when ? `${plan.when.from ?? '…'}..${plan.when.to ?? '…'}` : ''].filter(Boolean).join(' · ') || 'read the question'}`); }
    if (plan.done || !plan.queries.length) break;
    const before = reached.size;
    for (const g of plan.queries) {
      if (o.signal.aborted) break;
      const r = await o.run(g.sql);
      if (!r.ok) { ran.push({ ...g, rows: [], error: r.message.slice(0, 200) }); o.onStep?.(`Query failed: ${g.why || g.sql.slice(0, 80)} — ${r.message.split('\n')[0].slice(0, 120)}`); continue; }
      ran.push({ ...g, rows: r.rows });
      const ids = idsIn(r.rows, idx);
      o.onStep?.(`Query: ${g.why || g.sql.slice(0, 80)} — ${r.rows.length} row(s)`);
      for (const id of ids) reached.add(id);
      add(ids.map((id, i) => ({ id, score: 2 + 1 / (round + i / 100), why: `plan: ${g.why}` })));
    }
    if (reached.size === before) break;   // the plan's rows named nothing new: more rounds would ask the same
  }
  // no query of the plan ran: the graph step's deterministic queries stand in (the entities and what they share)
  const fallback = !ran.some(r => !r.error);
  if (fallback && !o.signal.aborted) add(await graphFind(idx, q, o.seen ?? [], { signal: o.signal, planner: false, onStep: o.onStep }));
  return { found: [...found.values()].sort((a, b) => b.score - a.score).slice(0, 40), plan: first, ran, rounds: done, fallback };
}

// what the deep lane reads: the plan, each query with its rows, then the nodes reached
export function planNote(r: PlanResult, idx: GraphIndex, max = 25): string {
  const p = r.plan;
  const head = p ? `Plan: ${[p.shape && `shape ${p.shape}`, p.entities.length && `entities ${p.entities.join(', ')}`, p.kinds.length && `kinds ${p.kinds.join(', ')}`, p.props.length && `props ${p.props.join(', ')}`, p.when && `time ${p.when.from ?? '…'}..${p.when.to ?? '…'}`].filter(Boolean).join('; ')}` : '';
  const qs = r.ran.filter(x => !x.error).map(x => `- ${x.why}: ${x.rows.length} row(s)${x.rows.length ? `\n  ${rowsText(x.rows, 15)}` : ''}`).join('\n');
  const nodes = r.found.filter(f => idx.byId.has(f.id)).slice(0, max).map(f => { const n = idx.byId.get(f.id)!; const t = timeOf(n); return `- ${f.id} (${n.kind}${t ? `, ${t[0] === t[1] ? t[0] : `${t[0]}..${t[1]}`}` : ''}) ${n.title} — ${f.why}`.slice(0, 220); }).join('\n');
  return [head, qs && `Query results:\n${qs}`, nodes && `Nodes reached:\n${nodes}`].filter(Boolean).join('\n\n');
}
