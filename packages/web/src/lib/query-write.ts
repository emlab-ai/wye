// A table's SQL written from words (decision:wf2.query-from-words): the person says what the table should show; one
// `claude -p` call (no tools) writes the query from the graph's real shape — the columns of `nodes`, its kinds with
// counts, the verbs of `edges`, the table's kind, page and current SQL — and the server runs it before handing it
// back. A query that fails is sent back once with the engine's message. Nothing is saved here: the table keeps it.
import { spawnClaude } from './ask/claude';
import { ASK_MODEL } from './ask/fast';
import { runQuery } from './query';

export type WriteIn = { ask: string; sql?: string; kind?: string; page?: string; me?: string[] };

// the graph's shape as the prompt reads it
async function shape(product: string): Promise<string> {
  const q = async (sql: string) => { const r = await runQuery(product, sql); return r.ok ? r.result.rows : []; };
  const cols = await q('DESCRIBE nodes');
  const kinds = await q('SELECT kind, count(*) AS n FROM nodes GROUP BY kind ORDER BY n DESC LIMIT 60');
  const verbs = await q('SELECT verb, count(*) AS n FROM edges GROUP BY verb ORDER BY n DESC LIMIT 40');
  return [
    `nodes columns: ${cols.map(c => `${c.column_name} ${c.column_type}`).join(', ')}`,
    `kinds (count): ${kinds.map(k => `${k.kind} (${k.n})`).join(', ')}`,
    `edge verbs (count): ${verbs.map(v => `${v.verb} (${v.n})`).join(', ')}`,
  ].join('\n');
}

export function writePrompt(input: WriteIn, graph: string, failed?: { sql: string; message: string }): string {
  return `You write one DuckDB SQL query for a table in Wye, a knowledge graph built from markdown. Reply with the query only — no prose, no code fence.

Tables:
- nodes: one row per item. id, kind, title, status, open (false once done/met/answered/…), folder, page ('folder/slug' of the page it is on), file, text, props (JSON of every property: props->>'key'), and one VARCHAR column per property (dashes become underscores; quote keywords like "from", "to"). Dates are 'YYYY-MM-DD' strings: compare with try_cast(due AS DATE) and current_date.
- edges: src, dst, verb — every link between items (src links to dst).
- has(cell, v): true when a cell is v or a list '[a, b]' holding v (owner, to, attendees, tags).
- Graph patterns (DuckPGQ): FROM GRAPH_TABLE (wye MATCH (a:nodes)-[e:edges]->(b:nodes) WHERE … COLUMNS (a.id AS id, …)).

The table shows items when the result has an id column: select id first, then only the extra columns worth showing (an item's own property column stays editable; joined values show read-only). Hide finished items with open unless asked otherwise. One read statement: SELECT / WITH / FROM. Never use "-->" in the query.

This product's graph:
${graph}

The table: kind ${input.kind ?? '(any)'}${input.page ? `, on the page '${input.page}' (page = '${input.page}' limits it to this page's items)` : ', across the whole product'}${input.me?.length ? `; "me" is ${input.me.map(m => `'${m}'`).join(' or ')}` : ''}.
Its current SQL:
${input.sql ?? '(none)'}
${failed ? `\nYour previous query failed:\n${failed.sql}\nError: ${failed.message}\nWrite a corrected query.\n` : ''}
What the person wants: ${input.ask}`;
}

const clean = (s: string) => s.trim().replace(/^```(?:sql)?\s*/i, '').replace(/```\s*$/, '').trim().replace(/;\s*$/, '');

async function once(prompt: string, signal: AbortSignal): Promise<string> {
  let out = '';
  for await (const l of spawnClaude(['-p', '--output-format', 'json', '--model', ASK_MODEL, '--tools', ''], prompt, { signal, timeoutMs: 90000 })) if (typeof l.result === 'string') out = l.result;
  return clean(out);
}

export async function writeQuery(product: string, input: WriteIn, signal: AbortSignal): Promise<{ ok: true; sql: string; rows: number } | { ok: false; message: string; sql?: string }> {
  if (!input.ask.trim()) return { ok: false, message: 'say what the table should show' };
  const graph = await shape(product);
  let failed: { sql: string; message: string } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sql = await once(writePrompt(input, graph, failed), signal);
    if (!sql) return { ok: false, message: 'the agent wrote no query' };
    if (sql.includes('-->')) { failed = { sql, message: 'the query may not contain -->' }; continue; }
    const r = await runQuery(product, sql);
    if (r.ok) return { ok: true, sql, rows: r.result.rows.length };
    failed = { sql, message: r.message };
  }
  return { ok: false, message: `the query did not run: ${failed?.message}`, sql: failed?.sql };
}
