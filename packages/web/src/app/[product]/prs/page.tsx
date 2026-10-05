import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';
import { EmptyState } from '@/components/EmptyState';
import { EmptyAction } from '@/components/EmptyActions';

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
      {table.rows.length ? <InstanceTable product={product} table={table} initial={filters} urlState /> : (
        <EmptyState icon="🗺" title="No Prompt Requests yet" actions={<EmptyAction act="pr" pri>New Prompt Request</EmptyAction>} hint="⌘P opens the command box anywhere">
          <p>A Prompt Request is a person&apos;s suggestion to change the product, written before an agent changes the code: what is asked and why, what behaviour changes, what it may reach. Here PR does not mean pull request.</p>
          <p>The librarian refines it with you; you approve it, then an agent builds it.</p>
        </EmptyState>)}
    </div>
  );
}
