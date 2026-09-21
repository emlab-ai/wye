import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInboxItems } from '@/lib/inbox';
import { reviewQueue, attachVerdicts } from '@/lib/review';
import { verdictLog, verdictsEnabled } from '@/lib/verdicts';
import { InboxNote } from '@/components/InboxNote';
import { InboxList } from '@/components/InboxList';
import { ReviewList } from '@/components/ReviewList';
import { ChangeList, type ChangeView } from '@/components/ChangeList';
import { listChanges, changedSince } from '@/lib/changes';
import type { ImpactSet } from '@/lib/impact-run';
import { docRoute } from '@/lib/doc';
import { InboxProjects } from '@/components/InboxProjects';

// The inbox is a review view over the documents: decisions, requirements, rules and goals still `proposed`, and
// open questions — written in place by agents and people, approved or resolved here. Raw notes (pasted material
// that has no document yet) sit below, to be filed.
export default async function InboxPage({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<{ ids?: string; task?: string; project?: string }> }) {
  const { product } = await params;
  const { ids, task, project } = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  // each proposed block with its verdicts (decision:memory.write-time-verdict): what the judge said about it and its neighbours
  let queue = attachVerdicts(reviewQueue(product, scope.graph, scope.idx), scope.graph, scope.idx, await verdictLog(scope.product.dir), await verdictsEnabled(scope.product.dir));
  // a task's Review (req:exec.done-comes-back) opens the Inbox on the blocks that task produced
  const only = ids ? new Set(ids.split(',').filter(Boolean)) : null;
  if (only) queue = queue.filter(i => only.has(i.id));
  // per project (req:wf2.inbox.per-project): the chips narrow every list to one project; a note has no project until it is filed
  const projects = scope.projects.map(p => ({ slug: p.slug, title: p.meta.title }));
  const inProject = (file: string) => !project || docRoute(file)?.project === project;
  if (project) queue = queue.filter(i => inProject(i.file));
  const notes = project ? [] : (await listInboxItems(scope.product.dir)).filter(i => i.status === 'new' || i.type === 'note');
  // pending edits of existing blocks (req:exec.change-kept): old and new side by side, with the verdicts the
  // write-time pass left under the node (req:exec.change-validated)
  const log = await verdictLog(scope.product.dir);
  const changes: ChangeView[] = only ? [] : (await listChanges(scope.product.dir, { state: 'pending', listed: true })).filter(c => inProject(c.file)).map(c => {
    const n = scope.idx.byId.get(c.node);
    const v = n ? attachVerdicts([{ id: c.node, kind: c.kind, title: n.title, text: '', status: n.status, file: n.file, project: '', doc: '', href: '', line: n.line, refs: [], fields: {} }], scope.graph, scope.idx, log, false)[0].verdicts : undefined;
    return { ...c, impact: c.impact as ImpactSet | undefined, stale: changedSince(c, n), exists: !!n?.defined, verdicts: v };
  });
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Inbox</h1><p className="sub">{only ? <>reviewing what {task ? <code>{task}</code> : 'a task'} produced — {queue.length} block{queue.length === 1 ? '' : 's'} waiting. <a href={`/${product}/inbox`}>Everything</a></> : <>to review: blocks written into the documents that nobody approved yet — proposed decisions, requirements, rules and goals, and open questions. Approving changes the block&apos;s status in its document.</>}</p></header>
      {projects.length > 1 && !only && <InboxProjects product={product} projects={projects} current={project ?? ''} />}
      <ChangeList product={product} changes={changes} />
      <ReviewList product={product} items={queue} />
      {!project && <>
        <h3 className="inbox-notes-head">Notes <span className="muted">pasted material without a document yet</span></h3>
        <InboxNote product={product} />
        <InboxList product={product} initial={notes} />
      </>}
    </div>
  );
}
