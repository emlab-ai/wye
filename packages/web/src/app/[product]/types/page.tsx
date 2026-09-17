import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instancesOf, isBaseType, ontologyDoc } from '@/lib/types';
import { docRoute } from '@/lib/doc';
import { TypeRows, type TypeRow } from '@/components/TypeRows';
import { AddType } from '@/components/AddType';

// The product's ontology: its own types first (declared in its documents), then the base types every product has.
export default async function TypesPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const types = [...(scope.graph.types ?? [])].sort((a, b) => a.chain.length - b.chain.length || a.slug.localeCompare(b.slug));
  const own = types.filter(t => !isBaseType(t)), base = types.filter(isBaseType);
  const row = (t: typeof types[number]): TypeRow => {
    const n = instancesOf(scope.graph, t.slug).length; const r = t.file && !isBaseType(t) ? docRoute(t.file) : null;
    return { id: t.id, slug: t.slug, extends: t.extends, purpose: t.purpose, instances: n, own: t.props.filter(p => p.from === t.id).length, doc: r ? { href: `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(t.id)}`, label: `${r.project} / ${r.doc}` } : undefined };
  };
  // where a new type is written: the ontology document; any product document can be chosen instead
  const home = ontologyDoc(scope.graph);
  const docs = scope.graph.modules.map(m => { const r = docRoute(m.file); return r ? { file: m.file, label: `${r.project} / ${r.doc}` } : null; }).filter((d): d is { file: string; label: string } => !!d).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div className="page">
      <header className="doc-head"><p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / Types</p><h1 className="prop-in h1" style={{ margin: 0 }}>Types <span className="muted">{types.length}</span></h1>
        <p className="lede">Every kind of node is a type. A product declares its own with a <code>type:</code> card (<code>extends</code>, <code>props</code>) in any document; an instance of <code>type:team</code> is <code>team:&lt;slug&gt;</code>. Properties inherit along <code>extends</code>; a <code>ref</code> or <code>list of</code> property is a link with a named inverse on the other side.</p></header>
      <section className="kind-section"><h2>{scope.product.meta.title}&apos;s types <span className="muted">{own.length}</span></h2>
        {own.length ? <TypeRows product={product} rows={own.map(row)} /> : <p className="muted">None yet. Add one below, or write a <code>type:</code> card in a document — see <Link href={`/${product}/types/node`}>type:node</Link> for the form.</p>}
        <AddType product={product} types={types.map(t => ({ id: t.id, slug: t.slug }))} docs={docs} home={home} /></section>
      <section className="kind-section"><h2>Base types <span className="muted">{base.length}</span></h2><TypeRows product={product} rows={base.map(row)} /></section>
    </div>
  );
}
