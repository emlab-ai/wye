import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { constraints } from '@/lib/constitution';
import { ConstitutionList } from '@/components/ConstitutionList';

// The constitution (decision:memory.constraint-type): the product's constraint: blocks — approved ones are what every
// agent prompt carries under "## Constitution"; proposed ones wait in the Inbox; retired ones are kept, greyed.
export default async function ConstitutionPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const rows = constraints(scope.graph, scope.idx);
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Constitution</h1><p className="sub">the product&apos;s constraints — rules about the product or how it is built that no code enforces. The approved ones go verbatim into every agent&apos;s system prompt and into the constraint packet of every request. A constraint is a <code>constraint:</code> block in a document (<code>statement</code>, <code>scope</code>, <code>rationale</code>); it is small by design — a constraint that needs a paragraph is a decision.</p></header>
      <ConstitutionList product={product} rows={rows} />
    </div>
  );
}
