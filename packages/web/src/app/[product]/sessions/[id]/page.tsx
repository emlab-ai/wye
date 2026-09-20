import { notFound, redirect } from 'next/navigation';
import { getProduct } from '@/lib/products';
import { getSession } from '@/lib/sessions';
import { prDocPath } from '@/lib/pr-doc';

// A session's page is its plan document (decision:wf2.plan-is-a-document); a session without one has only its
// changes page. The derived session page this route used to render is gone.
export default async function SessionPageRoute({ params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) notFound();
  const s = await getSession(p.dir, id); if (!s) notFound();
  redirect(s.prDoc ? prDocPath(s.prDoc) : `/${product}/sessions/${id}/changes`);
}
