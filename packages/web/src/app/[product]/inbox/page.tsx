import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInboxItems } from '@/lib/inbox';
import { reviewQueue, attachVerdicts } from '@/lib/review';
import { verdictLog, verdictsEnabled } from '@/lib/verdicts';
import { InboxNote } from '@/components/InboxNote';
import { InboxList } from '@/components/InboxList';
import { ReviewList } from '@/components/ReviewList';

// The inbox is a review view over the documents: decisions, requirements, rules and goals still `proposed`, and
// open questions — written in place by agents and people, approved or resolved here. Raw notes (pasted material
// that has no document yet) sit below, to be filed.
export default async function InboxPage({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<{ ids?: string; task?: string }> }) {
  const { product } = await params;
  const { ids, task } = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  // each proposed block with its verdicts (decision:memory.write-time-verdict): what the judge said about it and its neighbours
  let queue = attachVerdicts(reviewQueue(product, scope.graph, scope.idx), scope.graph, scope.idx, await verdictLog(scope.product.dir), await verdictsEnabled(scope.product.dir));
  // a task's Review (req:exec.done-comes-back) opens the Inbox on the blocks that task produced
  const only = ids ? new Set(ids.split(',').filter(Boolean)) : null;
  if (only) queue = queue.filter(i => only.has(i.id));
  const notes = (await listInboxItems(scope.product.dir)).filter(i => i.status === 'new' || i.type === 'note');
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Inbox</h1><p className="sub">{only ? <>reviewing what {task ? <code>{task}</code> : 'a task'} produced — {queue.length} block{queue.length === 1 ? '' : 's'} waiting. <a href={`/${product}/inbox`}>Everything</a></> : <>to review: blocks written into the documents that nobody approved yet — proposed decisions, requirements, rules and goals, and open questions. Approving changes the block&apos;s status in its document.</>}</p></header>
      <ReviewList product={product} items={queue} />
      <h3 className="inbox-notes-head">Notes <span className="muted">pasted material without a document yet</span></h3>
      <InboxNote product={product} />
      <InboxList product={product} initial={notes} />
    </div>
  );
}
