import { notFound, redirect } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { docRoute } from '@/lib/doc';

// A node's page is its definition inside its document; the route stays for deep links.
export default async function NodePage({ params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params;
  const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) notFound();
  const n = scope.idx.byId.get(id); if (!n) notFound();
  const r = n.file ? docRoute(n.file) : null;
  if (r) redirect(`/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(id)}`);
  redirect(`/${product}/graph?focus=${encodeURIComponent(id)}&preset=Mechanics`);
}
