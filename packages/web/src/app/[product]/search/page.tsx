import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';
import { KIND_LABELS } from '@/lib/knowledge';
import { getSession } from '@/lib/sessions';
import Link from 'next/link';

// page:web/search (req:wf2.ui.search): every block that matches a search, shown as blocks — the instances view over
// `node` (every kind) or over one kind when the search named it (`page:` → module), with the view's filters in
// the URL so a search is a link. Opened by Enter in the search panel (⌘F / Ctrl+F).
export default async function SearchPage({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { product } = await params;
  const query = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  const kind = (query.kind || 'node').replace(/^page$/, 'module');
  // always the `node` table (its rows carry text, so the search reads the blocks), narrowed to the kind when one was named
  const all = instanceTable(scope.graph, 'node');
  let rows = kind === 'node' ? all.rows : all.rows.filter(r => r.kind === kind);
  // a proposal's page (req:wf2.ui.intent): the blocks one conversation added or changed, as blocks, live as they land
  const session = query.session ? await getSession(scope.product.dir, query.session) : null;
  if (session) { const ids = new Set((session.artifacts?.blocks ?? []).filter(b => b.change !== 'removed').map(b => b.id)); rows = rows.filter(r => ids.has(r.id)); }
  const count = new Map<string, number>(); for (const r of rows) if (r.status) count.set(r.status, (count.get(r.status) ?? 0) + 1);
  const table = { ...all, slug: kind, rows, statuses: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  const filters = parseFilters(query, table.columns.map(c => c.name));
  const what = kind === 'node' ? 'every block' : `every ${KIND_LABELS[kind] ?? kind}`;
  return (
    <div className="page type-page">
      {session ? (
        <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Proposal</h1><p className="sub">{session.instruction.split('\n').find(l => l.trim())?.slice(0, 160)} — {session.status === 'running' || session.status === 'queued' ? 'Wye is reading and proposing; blocks appear here as they land.' : `${session.status}.`} {table.rows.length} block{table.rows.length === 1 ? '' : 's'} so far; the proposed ones wait in the <Link href={`/${product}/inbox`}>Inbox</Link>. Conversation: <Link href={`/${product}/sessions/${session.id}/chat`}>{session.id.slice(0, 6)}</Link>{session.prDoc ? <> · plan <Link href={`/${product}/${session.prDoc.split('/').slice(1).join('/d/')}`}>↗</Link></> : null}</p></header>
      ) : (
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Search</h1><p className="sub">{what}{filters.q ? <> matching <b>{filters.q}</b></> : ''} — {table.rows.length} in all. ⌘F opens the search panel from anywhere.</p></header>
      )}
      <InstanceTable product={product} table={table} initial={filters} urlState as="list" />
    </div>
  );
}
