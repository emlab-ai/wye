import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { instancesOf, isBaseType } from '@/lib/types';
import { docRoute } from '@/lib/doc';
import { SmartTag } from '@/components/SmartTag';

// The product's ontology: its own types first (declared in its documents), then the base types every product has.
export default async function TypesPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const types = [...(scope.graph.types ?? [])].sort((a, b) => a.chain.length - b.chain.length || a.slug.localeCompare(b.slug));
  const own = types.filter(t => !isBaseType(t)), base = types.filter(isBaseType);
  const row = (t: typeof types[number]) => {
    const n = instancesOf(scope.graph, t.slug).length; const r = t.file ? docRoute(t.file) : null;
    return (
      <li key={t.id}>
        <div className="klist-head"><Link className="tag k-type" href={`/${product}/types/${t.slug}`}><i />{t.slug}</Link>{t.extends && <span className="muted">extends <SmartTag id={t.extends} label={t.extends.slice(5)} /></span>}<span className="muted">{n} instance{n === 1 ? '' : 's'} · {t.props.filter(p => p.from === t.id).length} own propert{t.props.filter(p => p.from === t.id).length === 1 ? 'y' : 'ies'}</span>{r && <Link className="klist-doc" href={`/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(t.id)}`}>{r.project} / {r.doc}</Link>}</div>
        {t.purpose && <div className="klist-title">{t.purpose}</div>}
      </li>
    );
  };
  return (
    <div className="page">
      <header className="doc-head"><p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / Types</p><h1 className="prop-in h1" style={{ margin: 0 }}>Types <span className="muted">{types.length}</span></h1>
        <p className="lede">Every kind of node is a type. A product declares its own with a <code>type:</code> card (<code>extends</code>, <code>props</code>) in any document; an instance of <code>type:team</code> is <code>team:&lt;slug&gt;</code>. Properties inherit along <code>extends</code>; a <code>ref</code> or <code>list of</code> property is a link with a named inverse on the other side.</p></header>
      <section className="kind-section"><h2>{scope.product.meta.title}&apos;s types <span className="muted">{own.length}</span></h2>
        {own.length ? <ul className="klist">{own.map(row)}</ul> : <p className="muted">None yet. Add a <code>type:</code> card to a document — see <Link href={`/${product}/types/node`}>type:node</Link> for the form.</p>}</section>
      <section className="kind-section"><h2>Base types <span className="muted">{base.length}</span></h2><ul className="klist">{base.map(row)}</ul></section>
    </div>
  );
}
