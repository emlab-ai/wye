import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { trackRows } from '@/lib/track';
import { TrackList } from '@/components/TrackList';

// Every task of the product as a tracking list; a row opens the task in the right column.
export default async function Page({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const rows = trackRows(scope.index, 'task');
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Tasks</h1><p className="sub">tasks defined anywhere in {scope.product.meta.title}. Add one with a Table block (type: tasks) in any document, or write a task: line.</p></header>
      <TrackList product={product} kind="task" rows={rows} />
    </div>
  );
}
