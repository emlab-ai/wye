import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';

// Every plan of the product (type:plan, all projects) as the filterable instance table — the page the rail's Plans
// folder opens (page:web/plans, req:wf2.ui.plans-folder). A row opens the plan document.
export default async function Page({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const table = instanceTable(scope.graph, 'plan');
  const filters = parseFilters(await searchParams, table.columns.map(c => c.name));
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Plans</h1><p className="sub">every piece of work an agent took on in {scope.product.meta.title}: the request, what it found, the plan, the tasks and the result — one document per request, newest at the top of the rail's Plans folder.</p></header>
      {table.rows.length ? <InstanceTable product={product} table={table} initial={filters} urlState /> : <p className="muted">No plans yet. A request from the command box (⌘K) starts one.</p>}
    </div>
  );
}
