import { describe, it, expect, beforeAll } from 'vitest';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { GraphIndex, GraphNode, GraphEdge, TypeDef } from '../graph';
import { ontology, parsePlan, idsIn, planFind, planNote, planPrompt, type RunSql, type Planner } from './plan';

function index(nodes: Partial<GraphNode>[], edges: [string, string, string][]): GraphIndex {
  const byId = new Map<string, GraphNode>(), out = new Map<string, GraphEdge[]>(), inc = new Map<string, GraphEdge[]>();
  for (const n of nodes) byId.set(n.id!, { kind: n.id!.split(':')[0], title: '', status: 'proposed', section: '', subsection: '', body: '', defined: true, file: 'x.md', line: 1, ...n } as GraphNode);
  for (const [from, verb, to] of edges) { const e = { from, verb, to }; out.set(from, [...(out.get(from) ?? []), e]); inc.set(to, [...(inc.get(to) ?? []), e]); }
  return { byId, out, inc };
}
const nodes: Partial<GraphNode>[] = [
  { id: 'person:ana', title: 'Ana' },
  { id: 'person:ben', title: 'Ben' },
  { id: 'org:river-club', title: 'River Club' },
  { id: 'event:race-1', title: 'Ana ran a 10k race', body: 'date: 2024-03-02' },
  { id: 'event:race-2', title: 'Ana ran a half marathon', body: 'date: 2024-06-15' },
  { id: 'event:dinner', title: 'Ana and Ben had dinner', body: 'date: 2024-04' },
  { id: 'fact:ben-club', title: 'Ben is a member of the River Club' },
];
const edges: [string, string, string][] = [
  ['event:race-1', 'participants', 'person:ana'], ['event:race-2', 'participants', 'person:ana'],
  ['event:dinner', 'participants', 'person:ana'], ['event:dinner', 'participants', 'person:ben'],
  ['fact:ben-club', 'about', 'person:ben'], ['fact:ben-club', 'about', 'org:river-club'],
];
const idx = index(nodes, edges);
const types = [{ slug: 'event', purpose: 'something that happened at a point in time', props: [{ name: 'date', type: 'date', ref: null, many: false }, { name: 'participants', type: 'ref', ref: 'type:person', many: true }] }] as unknown as TypeDef[];

// the fixture as lib/query's tables, in an in-memory DuckDB
let conn: DuckDBConnection;
beforeAll(async () => {
  conn = await (await DuckDBInstance.create(':memory:')).connect();
  await conn.run('CREATE TABLE nodes (id VARCHAR, kind VARCHAR, title VARCHAR, status VARCHAR, text VARCHAR, props JSON, date VARCHAR)');
  await conn.run('CREATE TABLE edges (src VARCHAR, dst VARCHAR, verb VARCHAR)');
  for (const n of idx.byId.values()) { const d = n.body.match(/date: (\S+)/)?.[1]; await conn.run(`INSERT INTO nodes VALUES ('${n.id}', '${n.kind}', '${n.title}', 'proposed', '${n.title}', '{}', ${d ? `'${d}'` : 'NULL'})`); }
  for (const [s, v, d] of edges) await conn.run(`INSERT INTO edges VALUES ('${s}', '${d}', '${v}')`);
});
const run: RunSql = async sql => { try { const r = await conn.runAndReadAll(sql); return { ok: true, rows: r.getRowObjectsJS().map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))) }; } catch (e) { return { ok: false, message: String(e) }; } };
const planner = (replies: object[]): Planner & { prompts: string[] } => { const prompts: string[] = []; const f = async (p: string) => { prompts.push(p); return JSON.stringify(replies[prompts.length - 1] ?? { done: true, queries: [] }); }; return Object.assign(f, { prompts }); };
const sig = () => new AbortController().signal;

describe('Ask\'s query plan', () => {
  it('tells the planner each kind in use with its purpose, its props, which carry time and which link', () => {
    const o = ontology(idx, types);
    expect(o).toContain('event (3) — something that happened at a point in time');
    expect(o).toContain('date (date, its time)');
    expect(o).toContain('participants (list of person, a link)');
    expect(o).toMatch(/links in use: participants \(4\)/);
    expect(o).toContain('time covered: 2024-03-02 .. 2024-06-15');
  });
  it('reads a plan and drops what is not one', () => {
    const p = parsePlan('sure: {"shape":"count","entities":["person:ana"],"kinds":["event"],"queries":[{"sql":"SELECT 1","why":"x"},{"nosql":1}]}');
    expect(p).toMatchObject({ shape: 'count', entities: ['person:ana'], kinds: ['event'], queries: [{ sql: 'SELECT 1', why: 'x' }] });
    expect(parsePlan('no json')).toBeNull();
    expect(parsePlan('{"shape":"odd","queries":[]}')!.shape).toBeUndefined();
  });
  it('finds node ids in any column of a row', () => {
    expect(idsIn([{ id: 'event:race-1' }, { src: 'event:dinner', dst: 'person:ben', n: 3 }, { list: '[person:ana, nope]' }], idx).sort()).toEqual(['event:dinner', 'event:race-1', 'person:ana', 'person:ben']);
  });
  it('a count question: the plan computes the count and brings the nodes counted', async () => {
    const sql = "SELECT n.id, n.title, n.date, count(*) OVER () AS races FROM nodes n JOIN edges e ON e.src = n.id AND e.verb = 'participants' WHERE e.dst = 'person:ana' AND n.title ILIKE '%race%' OR n.title ILIKE '%marathon%' ORDER BY n.date";
    const p = planner([{ shape: 'count', entities: ['person:ana'], kinds: ['event'], queries: [{ sql, why: 'races Ana ran' }] }]);
    const r = await planFind(idx, 'How many races did Ana run?', { signal: sig(), rounds: 1, hops: 1, types, run, planner: p });
    expect(p.prompts).toHaveLength(1);
    expect(r.ran[0].rows).toHaveLength(2); expect(r.ran[0].rows[0].races).toBe(2);
    expect(r.found.slice(0, 2).map(f => f.id).sort()).toEqual(['event:race-1', 'event:race-2']);
    expect(planNote(r, idx)).toContain('races=2');
  });
  it('a two-hop question over two rounds: the second asks what the first left missing', async () => {
    const q1 = "SELECT DISTINCT e2.dst AS id FROM edges e1 JOIN edges e2 ON e2.src = e1.src WHERE e1.dst = 'person:ana' AND e2.dst <> 'person:ana'";
    const q2 = "SELECT f.id, f.title FROM edges e JOIN nodes f ON f.id = e.src WHERE e.dst = 'person:ben' AND f.kind = 'fact'";
    const p = planner([{ shape: 'lookup', queries: [{ sql: q1, why: 'who Ana did things with' }] }, { queries: [{ sql: q2, why: 'what is known about Ben' }] }, { done: true, queries: [] }]);
    const r = await planFind(idx, 'Which club is Ana\'s dinner companion a member of?', { signal: sig(), rounds: 3, hops: 2, types, run, planner: p });
    expect(p.prompts[1]).toContain('Round 2 of 3'); expect(p.prompts[1]).toContain('person:ben');
    expect(r.found.map(f => f.id)).toContain('fact:ben-club');
    expect(r.rounds).toBe(3);
  });
  it('stops early when a round adds no new node', async () => {
    const q = "SELECT id FROM nodes WHERE id = 'event:race-1'";
    const p = planner([{ queries: [{ sql: q, why: 'a' }] }, { queries: [{ sql: q, why: 'the same again' }] }, { queries: [{ sql: q, why: 'never asked' }] }]);
    const r = await planFind(idx, 'When was the 10k?', { signal: sig(), rounds: 3, run, planner: p });
    expect(p.prompts).toHaveLength(2); expect(r.rounds).toBe(2);
  });
  it('a query that fails is said, and when none runs the graph step\'s queries stand in', async () => {
    const steps: string[] = [];
    const p = planner([{ queries: [{ sql: 'SELECT nope FROM nowhere', why: 'broken' }] }]);
    const r = await planFind(idx, 'What did Ana and Ben do together?', { signal: sig(), rounds: 1, run, planner: async x => (await p(x)), onStep: t => steps.push(t) });
    expect(steps.some(s => s.startsWith('Query failed: broken'))).toBe(true);
    expect(r.fallback).toBe(true);
    expect(r.found[0].id).toBe('event:dinner');
  });
  it('tells the planner how many links it may follow', () => {
    expect(planPrompt('q', 'onto', [], [], 1, { rounds: 2, hops: 3 })).toContain('follow at most 3 links');
  });
});
