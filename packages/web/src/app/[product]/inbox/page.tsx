import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInboxItems } from '@/lib/inbox';
import { InboxNote } from '@/components/InboxNote';
import { InboxList } from '@/components/InboxList';

// The inbox: decisions, requirements, rules, questions and notes waiting for review. Agents and people add items;
// reviewing files an item into a document as a node (with a suggested home) or dismisses it.
export default async function InboxPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const items = await listInboxItems(scope.product.dir);
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Inbox</h1><p className="sub">knowledge candidates waiting for review. Agents record every decision, requirement, rule and question here; filing turns an item into a node in the right document.</p></header>
      <InboxNote product={product} />
      <InboxList product={product} initial={items} />
    </div>
  );
}
