import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';
import { KIND_LABELS } from '@/lib/knowledge';

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
  const rows = kind === 'node' ? all.rows : all.rows.filter(r => r.kind === kind);
  const count = new Map<string, number>(); for (const r of rows) if (r.status) count.set(r.status, (count.get(r.status) ?? 0) + 1);
  const table = { ...all, slug: kind, rows, statuses: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  const filters = parseFilters(query, table.columns.map(c => c.name));
  const what = kind === 'node' ? 'every block' : `every ${KIND_LABELS[kind] ?? kind}`;
  return (
    <div className="page type-page">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Search</h1><p className="sub">{what}{filters.q ? <> matching <b>{filters.q}</b></> : ''} — {table.rows.length} in all. ⌘F opens the search panel from anywhere.</p></header>
      <InstanceTable product={product} table={table} initial={filters} urlState as="list" />
    </div>
  );
}
