import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { KIND_LABELS } from '@/lib/knowledge';
import { instanceTable, parseFilters, viewQuery } from '@/lib/instance-table';
import { KindTable } from '@/components/KindTable';

// One kind of knowledge as a Data table or Data list from the whole product (decision:wf2.knowledge-pages-are-data-tables):
// rows edited in place, done ones hidden unless asked, table ⇄ list; the filter and the view come from the URL.
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
      <KindTable product={product} kind={kind} initialQuery={viewQuery(filters)} initialView={query.as === 'list' ? 'list' : 'table'} />
    </div>
  );
}
