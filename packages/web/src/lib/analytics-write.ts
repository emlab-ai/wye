// An analytics page written from words (decision:waterfall.analytics-from-words, decision:wf2.query-from-words): the
// person says what the page should show — "tasks by team per month", "a board of what is blocked, by worker" — and
// one `claude -p` call (no tools) writes the page's whole query line from the graph's real shape: the kinds with
// counts, the properties the nodes carry with the values they hold, the verbs of `edges`, and the line as it is. A
// line that carries `sql=` is run once before it is handed back; one that fails is sent back once with the engine's
// message. Nothing is saved here: the page keeps the line in its front matter.
import { spawnClaude } from './ask/claude';
import { ASK_MODEL } from './ask/fast';
import { runQuery } from './query';
import { loadScope } from './scope';
import { BUCKETS, TIME_FIELDS, analyticsQueryString, buildAnalytics, facetsOf, parseAnalyticsQuery } from './analytics';

export type WriteIn = { ask: string; query?: string };

// the graph's shape as the prompt reads it: the kinds, the properties and their values, the verbs
async function shape(product: string): Promise<string> {
  const scope = await loadScope(product);
  const nodes = (scope?.graph.nodes ?? []).filter(n => n.defined && n.kind !== 'type' && n.form !== 'block');
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const kinds = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => `${k} (${n})`).join(', ');
  const facets = facetsOf(nodes).slice(0, 40).map(f => `${f.name}: ${f.values.slice(0, 8).join(', ')}`).join('\n  ');
  const verbs = new Map<string, number>();
  for (const e of scope?.graph.edges ?? []) if (e.verb !== 'mentions') verbs.set(e.verb, (verbs.get(e.verb) ?? 0) + 1);
  const edges = [...verbs].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([v, n]) => `${v} (${n})`).join(', ');
  return `kinds (count): ${kinds}\nproperties the items carry, with the values they hold:\n  ${facets}\nlink verbs (count): ${edges}`;
}

export function writePrompt(input: WriteIn, graph: string, failed?: { query: string; message: string }): string {
  return `You write the query line of an analytics page in Wye, a knowledge graph built from markdown. The page is a grid of cards: its rows and its columns are each a stack of dimensions, and every cell holds the items at that intersection. Reply with the query line only — one line, no prose, no code fence.

The line is space-separated key=value pairs (quote a value that has spaces):
- kind=task,goal — the kinds of item to show (a comma is "or"; leave it out for every kind)
- status=open,blocked — only these statuses
- q=words — items whose title or id has the words
- <property>=<value> — items whose property holds the value, by its words or the id it points at (worker=ana, quarter=q3; a comma is "or"; none = items that say nothing for it)
- <verb>.<verb>=<value> — a path of links: worker.part-of=Till means "the team the worker is part of is Till"
- y=<dims> — the rows, outer first; x=<dims> — the columns, outer first. Either may be empty.
  A dimension is a property name (worker, owner, module, priority), kind, status, a path of links (worker.part-of groups by the team of the worker), or a date field with a bucket: ${Object.keys(TIME_FIELDS).join(' | ')} with :${BUCKETS.filter(b => b !== 'span').join(' | :')} (due:month, when:week, date:quarter). "when" is when the item happens — its starts, else its due date.
  when:span (or starts:span) as the LAST column level draws a continuous time track — a Gantt. Use it when the person wants a timeline.
- sql="SELECT id FROM nodes WHERE …" — only when the switches above cannot say it (a join, a date arithmetic, a text search over the body). Then kind, status, q and the property filters are ignored and the SQL picks the items: nodes(id, kind, title, status, open, page, text, props JSON — props->>'key', and a column per property with dashes as underscores), edges(src, dst, verb). One read statement; never "-->".

Patterns: a kanban is x=status; a board per team is y=worker.part-of x=status; a planner is y=worker x=when:week; "by team per month" is y=worker.part-of,worker x=when:month; a timeline is y=worker.part-of,worker x=when:span. Keep the dimensions few — two per axis at most unless asked. Prefer the switches to sql=. Keep what the person did not ask to change.

This product's graph:
${graph}

The line as it is now:
${input.query?.trim() || '(empty — every item, one row, one column)'}
${failed ? `\nYour previous line failed:\n${failed.query}\nError: ${failed.message}\nWrite a corrected line.\n` : ''}
What the person wants: ${input.ask}`;
}

const clean = (s: string) => s.trim().replace(/^```\w*\s*/i, '').replace(/```\s*$/, '').trim().split('\n').map(l => l.trim()).filter(Boolean).pop() ?? '';

async function once(prompt: string, signal: AbortSignal): Promise<string> {
  let out = '';
  for await (const l of spawnClaude(['-p', '--output-format', 'json', '--model', ASK_MODEL, '--tools', ''], prompt, { signal, timeoutMs: 90000 })) if (typeof l.result === 'string') out = l.result;
  return clean(out);
}

// The line the agent wrote, parsed and written back in the page's own spelling; a line with sql= is run once, and
// the cards it draws are counted so the person sees what they got before the page redraws.
export async function writeAnalytics(product: string, input: WriteIn, signal: AbortSignal): Promise<{ ok: true; query: string; cards: number } | { ok: false; message: string; query?: string }> {
  if (!input.ask.trim()) return { ok: false, message: 'say what the page should show' };
  const graph = await shape(product);
  let failed: { query: string; message: string } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const line = await once(writePrompt(input, graph, failed), signal);
    if (!line) return { ok: false, message: 'the agent wrote no query' };
    if (!/\b(kind|status|q|y|x|sql|[\w.-]+)=/.test(line)) { failed = { query: line, message: 'not a query line — key=value pairs' }; continue; }
    const q = parseAnalyticsQuery(line);
    const query = analyticsQueryString(q);
    let ids: Set<string> | undefined;
    if (q.sql) {
      if (q.sql.includes('-->')) { failed = { query, message: 'the query may not contain -->' }; continue; }
      const r = await runQuery(product, q.sql);
      if (!r.ok) { failed = { query, message: r.message }; continue; }
      if (!r.result.columns.includes('id')) { failed = { query, message: 'the SQL has no id column' }; continue; }
      ids = new Set(r.result.rows.map(x => String(x.id ?? '')));
    }
    const scope = await loadScope(product);
    const cards = scope ? buildAnalytics(scope.graph, scope.idx, q, ids).total : 0;
    return { ok: true, query, cards };
  }
  return { ok: false, message: `the line did not work: ${failed?.message}`, query: failed?.query };
}
