import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';
import { listSessions, listRunners } from '@/lib/sessions';
import { SessionList } from '@/components/SessionList';

// Agent sessions of the product: what has been sent to agents and how it is going.
export default async function SessionsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) notFound();
  const [sessions, runners] = await Promise.all([listSessions(p.dir), listRunners(p.dir)]);
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Sessions</h1><p className="sub">work sent to agents from blocks, nodes and goals; runners pick sessions up and stream their output here.</p></header>
      <SessionList product={product} initial={sessions} initialRunners={runners} />
    </div>
  );
}
