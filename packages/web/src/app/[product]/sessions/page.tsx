import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';
import { listSessions, listRunners } from '@/lib/sessions';
import { liveState } from '@/lib/agent-host';
import { SessionList } from '@/components/SessionList';

// Agent sessions of the product: what has been sent to agents and how it is going.
export default async function SessionsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) notFound();
  // the process state comes from this server process, so the first paint already shows what is up
  const [sessions, runners] = await Promise.all([listSessions(p.dir).then(ss => ss.map(s => ({ ...s, transcript: undefined, ...(s.mode === 'chat' ? liveState(s.id) : {}) }))), listRunners(p.dir)]);
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Agents</h1><p className="sub">every conversation and run: a claude or codex process that is up is active — working, or live and waiting for your next message; runners pick queued work up and stream here.</p></header>
      <SessionList product={product} initial={sessions} initialRunners={runners} />
    </div>
  );
}
