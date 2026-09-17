import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInboxItems } from '@/lib/inbox';
import { reviewQueue } from '@/lib/review';
import { InboxNote } from '@/components/InboxNote';
import { InboxList } from '@/components/InboxList';
import { ReviewList } from '@/components/ReviewList';

// The inbox is a review view over the documents: decisions, requirements, rules and goals still `proposed`, and
// open questions — written in place by agents and people, approved or resolved here. Raw notes (pasted material
// that has no document yet) sit below, to be filed.
export default async function InboxPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const queue = reviewQueue(product, scope.graph, scope.idx);
  const notes = (await listInboxItems(scope.product.dir)).filter(i => i.status === 'new' || i.type === 'note');
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Inbox</h1><p className="sub">to review: blocks written into the documents that nobody approved yet — proposed decisions, requirements, rules and goals, and open questions. Approving changes the block's status in its document.</p></header>
      <ReviewList product={product} items={queue} />
      <h3 className="inbox-notes-head">Notes <span className="muted">pasted material without a document yet</span></h3>
      <InboxNote product={product} />
      <InboxList product={product} initial={notes} />
    </div>
  );
}
