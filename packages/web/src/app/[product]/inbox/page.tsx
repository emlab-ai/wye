import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInboxItems, settleDigested } from '@/lib/inbox';
import { getSession } from '@/lib/sessions';
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
import { EmptyState } from '@/components/EmptyState';
import { EmptyAction } from '@/components/EmptyActions';
import Link from 'next/link';
import { KindPill, StatusPill } from '@/components/Pills';
import { currentWorkspace, workspaceProducts } from '@/lib/workspace';

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
  const notes = project ? [] : await settleDigested(scope.product.dir, (await listInboxItems(scope.product.dir)).filter(i => i.status === 'new' || i.type === 'note'), async id => (await getSession(scope.product.dir, id))?.status ?? null);
  // pending edits of existing blocks (req:exec.change-kept): old and new side by side, with the verdicts the
  // write-time pass left under the node (req:exec.change-validated)
  const log = await verdictLog(scope.product.dir);
  const changes: ChangeView[] = only ? [] : (await listChanges(scope.product.dir, { state: 'pending', listed: true })).filter(c => inProject(c.file)).map(c => {
    const n = scope.idx.byId.get(c.node);
    const v = n ? attachVerdicts([{ id: c.node, kind: c.kind, title: n.title, text: '', status: n.status, file: n.file, project: '', doc: '', href: '', line: n.line, refs: [], fields: {} }], scope.graph, scope.idx, log, false)[0].verdicts : undefined;
    return { ...c, impact: c.impact as ImpactSet | undefined, stale: changedSince(c, n), exists: !!n?.defined, verdicts: v };
  });
  // the other vaults of the workspace (req:wf2.workspace-open, req:wf2.vault-write-back): what waits in each, named by
  // its vault — a block is approved in the vault whose document holds it, so each row opens that vault's Inbox on it
  const others: { slug: string; title: string; icon: string; items: { id: string; kind: string; title: string; status: string }[]; changes: number }[] = [];
  // in an opened folder only: at home the products are separate, each with its own Inbox (decision:wf2.home-is-separate-products)
  if (!only && !project && await currentWorkspace()) for (const o of (await workspaceProducts()).filter(p => p.slug !== product)) {
    const sc = await loadScope(o.slug).catch(() => null); if (!sc) continue;
    const q = reviewQueue(o.slug, sc.graph, sc.idx); const ch = (await listChanges(o.dir, { state: 'pending', listed: true }).catch(() => [])).length;
    if (q.length || ch) others.push({ slug: o.slug, title: o.meta.title, icon: o.meta.icon, items: q.map(i => ({ id: i.id, kind: i.kind, title: i.title, status: i.status })), changes: ch });
  }
  // nothing at all waits, and nothing narrows the view: the page says what lands here instead of three empty lists
  const empty = !only && !project && !queue.length && !changes.length && !notes.length;
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Inbox{others.length > 0 && <span className="vault-chip inbox-of">{scope.product.meta.title}</span>}</h1><p className="sub">{only ? <>reviewing what {task ? <code>{task}</code> : 'a task'} produced — {queue.length} block{queue.length === 1 ? '' : 's'} waiting. <a href={`/${product}/inbox`}>Everything</a></> : <>to review: blocks written into the documents that nobody approved yet — proposed decisions, requirements, rules, goals, facts and lessons (what Remember and the sessions file), and open questions. Approving changes the block&apos;s status in its document.</>}</p></header>
      {projects.length > 1 && !only && <InboxProjects product={product} projects={projects} current={project ?? ''} />}
      <ChangeList product={product} changes={changes} />
      {empty
        ? <EmptyState icon="⇩" title="Nothing waiting for review" actions={<EmptyAction act="remember" pri>Remember a note</EmptyAction>} hint="⌘M opens Remember anywhere">
            <p>What agents propose, and what Remember files from a pasted note, lands here for a person to approve. Approving a block changes its status in the document it lives in.</p>
          </EmptyState>
        : <ReviewList product={product} items={queue} />}
      {others.length > 0 && <section className="inbox-vaults">
        <h3 className="inbox-notes-head">In the other vaults <span className="muted">of this workspace — each is reviewed in its own vault</span></h3>
        {others.map(o => (
          <div key={o.slug} className="inbox-vault">
            <h4><Link href={`/${o.slug}/inbox`}><span className="vault-chip">{o.icon ? `${o.icon} ` : ''}{o.title}</span></Link> <span className="muted">{o.items.length} to review{o.changes ? ` · ${o.changes} pending change${o.changes === 1 ? '' : 's'}` : ''}</span></h4>
            <ul>{o.items.slice(0, 12).map(i => <li key={i.id}><Link href={`/${o.slug}/inbox?ids=${encodeURIComponent(i.id)}`} title={`${i.id} — review it in ${o.title}`}><KindPill kind={i.kind} /><span className="inbox-vault-title">{i.title.replace(/[*_`~]/g, '')}</span><StatusPill status={i.status} /></Link></li>)}</ul>
            {o.items.length > 12 && <p className="muted small"><Link href={`/${o.slug}/inbox`}>and {o.items.length - 12} more in {o.title}</Link></p>}
          </div>))}
      </section>}
      {!project && <>
        <h3 className="inbox-notes-head">Notes <span className="muted">raw input — the person&apos;s words as they were said, with what they touch; and pasted material without a document yet</span></h3>
        <InboxNote product={product} />
        <InboxList product={product} initial={notes} quiet={empty} />
      </>}
    </div>
  );
}
