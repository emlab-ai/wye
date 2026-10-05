import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { KIND_LABELS, kindExample } from '@/lib/knowledge';
import { KINDS } from '@/lib/ids';
import { EmptyState } from '@/components/EmptyState';
import { EmptyAction } from '@/components/EmptyActions';
import { instanceTable, parseFilters, viewQuery } from '@/lib/instance-table';
import { KindTable } from '@/components/KindTable';

// One kind of knowledge as a Data table or Data list from the whole product (decision:wf2.knowledge-pages-are-data-tables):
// rows edited in place, done ones hidden unless asked, table ⇄ list; the filter and the view come from the URL.
export default async function KindPage({ params, searchParams }: { params: Promise<{ product: string; kind: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { product, kind } = await params;
  const query = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  const table = instanceTable(scope.graph, kind);
  // a kind the product knows (a base kind or a declared type) with no instances yet says how to write the first one
  if (!table.rows.length && !table.typed && !(KINDS as readonly string[]).includes(kind)) notFound();
  if (!table.rows.length) return (
    <div className="page type-page">
      <header className="doc-head"><p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / {KIND_LABELS[kind] ?? kind}</p><h1 className="prop-in h1" style={{ margin: 0 }}>{KIND_LABELS[kind] ?? kind}</h1></header>
      <EmptyState title={`No ${(KIND_LABELS[kind] ?? kind).toLowerCase()} yet`} actions={<EmptyAction act="new-page">New document</EmptyAction>}>
        <p>Write one as a line in the document it belongs to; it shows here once the document is saved.</p>
        <p><code>{kindExample(kind)}</code></p>
      </EmptyState>
    </div>
  );
  const filters = parseFilters(query, table.columns.map(c => c.name));
  return (
    <div className="page type-page">
      <header className="doc-head"><p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / {KIND_LABELS[kind] ?? kind}</p><h1 className="prop-in h1" style={{ margin: 0 }}>{KIND_LABELS[kind] ?? kind} <span className="muted">{table.rows.length}</span>{table.typed && <Link className="klist-doc" href={`/${product}/types/${kind}`} style={{ marginLeft: 10 }}>type:{kind} ↗</Link>}</h1></header>
      <KindTable product={product} kind={kind} initialQuery={viewQuery(filters)} initialView={query.as === 'list' ? 'list' : 'table'} />
    </div>
  );
}
