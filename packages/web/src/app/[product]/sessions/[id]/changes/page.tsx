import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { getSession } from '@/lib/sessions';
import { sessionChanges, changeCounts, countsLine } from '@/lib/session-changes';
import { SessionChanges } from '@/components/SessionChanges';

// A session's changes as a page: every block it added, changed or removed, per document (req:wf2.sessions.changes-page).
export default async function SessionChangesPage({ params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const s = await getSession(scope.product.dir, id); if (!s) notFound();
  const groups = sessionChanges(s, scope.graph), counts = changeCounts(groups);
  const active = s.status === 'running' || s.status === 'queued';
  return (
    <div className="page">
      <header className="doc-head">
        <p className="crumbs"><Link href={`/${product}/sessions`}>Agents</Link> / session {id.slice(0, 6)}</p>
        <h1 className="prop-in h1" style={{ margin: 0 }}>Changes <span className="muted">{countsLine(counts) || 'none'}</span></h1>
        <p className="sub">{s.agent} · {s.status} · {s.instruction.split('\n')[0].slice(0, 160)}</p>
      </header>
      <SessionChanges product={product} id={id} initial={{ counts, groups }} live={active} />
    </div>
  );
}
