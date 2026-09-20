import { notFound, redirect } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { viewPageId } from '@/lib/plan-docs';
import { trackRows } from '@/lib/track';
import { TrackList } from '@/components/TrackList';

// Every goal of the product as a tracking list; a row opens the goal in the right column.
export default async function Page({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  // the Goals page is a document holding the instances view (decision:wf2.views-are-pages); this route only redirects to it
  const home = scope.projects.find(p => scope.graph.modules.some(m => m.id === viewPageId(p.slug, 'goals')));
  if (home) redirect(`/${product}/${home.slug}/d/goals`);
  const rows = trackRows(scope.index, 'goal');
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Goals</h1><p className="sub">goals defined anywhere in {scope.product.meta.title}. Add one with a "Goals table" block in any document, or write a goal: line.</p></header>
      <TrackList product={product} kind="goal" rows={rows} />
    </div>
  );
}
