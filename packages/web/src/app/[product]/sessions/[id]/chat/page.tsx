import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';
import { getSession } from '@/lib/sessions';
import { SessionView } from '@/components/SessionView';

// A conversation as a page in the content column (its own tab): the same view the context column shows — header,
// work, queue, transcript, message box — with the width of the page. The Agents page opens conversations here.
export default async function SessionChatPage({ params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) notFound();
  const s = await getSession(p.dir, id); if (!s) notFound();
  return <div className="page session-page"><SessionView id={id} /></div>;
}
