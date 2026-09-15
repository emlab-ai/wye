import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInbox } from '@/lib/products';
import { InboxNote } from '@/components/InboxNote';

// The inbox: files, notes and conversations dropped into the product, waiting for the clerk to turn them into knowledge.
export default async function InboxPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const items = (await listInbox(scope.product)).sort((a, b) => b.mtime.localeCompare(a.mtime));
  return (
    <div className="page">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Inbox</h1><p className="lede">Drop anything here: notes, pasted conversations, decisions, files. Nothing is processed yet; the clerk will turn these into knowledge later. Files can also be copied into <code>data/products/{product}/inbox/</code>.</p></header>
      <InboxNote product={product} />
      <ul className="klist">
        {items.map(i => <li key={i.name}><div className="klist-head"><b>{i.name}</b><small className="muted">{(i.size / 1024).toFixed(1)} KB · {i.mtime.slice(0, 16).replace('T', ' ')}</small></div></li>)}
        {!items.length && <li className="muted">Empty.</li>}
      </ul>
    </div>
  );
}
