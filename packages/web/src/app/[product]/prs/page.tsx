import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';

// Every request of the product (type:pr, all projects) as the filterable instance table — the page the rail's PRs
// folder opens (page:web/prs, req:wf2.ui.plans-folder). A row opens the request.
export default async function Page({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const table = instanceTable(scope.graph, 'pr');
  const filters = parseFilters(await searchParams, table.columns.map(c => c.name));
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>PRs</h1><p className="sub">every Prompt Request to {scope.product.meta.title}: what was asked, what it touches, the blocks it proposes, its impact, the tasks and the result — refined until clear, approved here, then built.</p></header>
      {table.rows.length ? <InstanceTable product={product} table={table} initial={filters} urlState /> : <p className="muted">No PRs yet. ⌘P in PR mode starts one.</p>}
    </div>
  );
}
