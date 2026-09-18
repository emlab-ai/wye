import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { getSession } from '@/lib/sessions';
import { liveState } from '@/lib/agent-host';
import { sessionPage } from '@/lib/session-page';
import { SessionPage } from '@/components/SessionPage';

// A session as a page (page:web/session, req:wf2.sessions.page): the task, the page its plan was written on, the
// todo items with their state now, the blocks it touched by kind, the result. Derived — decision:wf2.session-page-derived.
export default async function SessionPageRoute({ params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const s = await getSession(scope.product.dir, id); if (!s) notFound();
  const data = sessionPage(s, scope.graph);
  const session = { ...s, transcript: undefined, log: [], ...(s.mode === 'chat' ? liveState(s.id) : {}) };
  return <SessionPage product={product} id={id} initial={{ session, ...data }} />;
}
