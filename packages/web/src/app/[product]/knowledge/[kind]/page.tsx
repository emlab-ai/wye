import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { KIND_LABELS } from '@/lib/knowledge';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';

// One kind of knowledge as a filterable table (component:instance-table): a declared type gets a column per property,
// a bare kind its relations; search, status, group by and sort come from the URL so a filtered list is a link.
export default async function KindPage({ params, searchParams }: { params: Promise<{ product: string; kind: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { product, kind } = await params;
  const query = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  const table = instanceTable(scope.graph, kind);
  if (!table.rows.length) notFound();
  const filters = parseFilters(query, table.columns.map(c => c.name));
  return (
    <div className="page type-page">
      <header className="doc-head"><p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / {KIND_LABELS[kind] ?? kind}</p><h1 className="prop-in h1" style={{ margin: 0 }}>{KIND_LABELS[kind] ?? kind} <span className="muted">{table.rows.length}</span>{table.typed && <Link className="klist-doc" href={`/${product}/types/${kind}`} style={{ marginLeft: 10 }}>type:{kind} ↗</Link>}</h1></header>
      <InstanceTable product={product} table={table} initial={filters} urlState />
    </div>
  );
}
