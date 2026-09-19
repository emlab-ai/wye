import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { loadScope } from '@/lib/scope';
import { loadWork } from '@/lib/work-io';
import { WorkList } from '@/components/WorkList';

// page:web/work (req:exec.work-view): every task of the product — plans, PRDs, designs, the backlog — as one list,
// whoever holds it; the state beside the status comes from the session records (req:exec.work-states).
export default async function Page({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const { items, people } = await loadWork(scope);
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Work</h1><p className="sub">every task of {scope.product.meta.title}, whoever holds it — a request sent to an agent, a step on a plan, a line in a document, an item dropped for later. Assign hands one to a person or an agent; a task in review waits for you.</p></header>
      <Suspense><WorkList product={product} items={items} people={people} /></Suspense>
    </div>
  );
}
