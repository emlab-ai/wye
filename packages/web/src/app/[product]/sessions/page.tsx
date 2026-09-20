import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';
import { listSessions, listRunners } from '@/lib/sessions';
import { liveState } from '@/lib/agent-host';
import { loadScope } from '@/lib/scope';
import { prsOf } from '@/lib/pr-doc';
import { SessionList } from '@/components/SessionList';

// Agent sessions of the product: what has been sent to agents and how it is going.
export default async function SessionsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) notFound();
  // the process state comes from this server process, so the first paint already shows what is up
  const [scope, list, runners] = await Promise.all([loadScope(product), listSessions(p.dir), listRunners(p.dir)]);
  const sessions = list.map(s => ({ ...s, transcript: undefined, ...(s.mode === 'chat' ? liveState(s.id) : {}), prs: scope ? prsOf(product, scope.graph, s.id) : [] }));
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Agents</h1><p className="sub">every worker — a conversation or a run — with the plans it is on and has done: a claude or codex process that is up is active — working, or live and waiting for your next message; runners pick queued work up and stream here.</p></header>
      <SessionList product={product} initial={sessions} initialRunners={runners} />
    </div>
  );
}
