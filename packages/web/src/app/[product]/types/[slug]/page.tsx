import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { typeBySlug, instancesOf, subtypesOf, isBaseType, isImplicit } from '@/lib/types';
import { instanceTable, parseFilters } from '@/lib/instance-table';
import { InstanceTable } from '@/components/InstanceTable';
import { docRoute } from '@/lib/doc';
import { AddInstance } from '@/components/AddInstance';
import { pluralTitle } from '@/lib/instances';

// A type's page: its properties (own and inherited), its subtypes, and every instance as a table with one column per
// property — the database view, derived from the documents, never stored.
export default async function TypePage({ params, searchParams }: { params: Promise<{ product: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { product, slug } = await params;
  const query = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  const t = typeBySlug(scope.graph, slug); if (!t) notFound();
  const r = t.file && !isBaseType(t) ? docRoute(t.file) : null;
  const instances = instancesOf(scope.graph, slug);
  const subtypes = subtypesOf(scope.graph, slug);
  const declared = slug === 'node' ? t.props : t.props.filter(p => !isImplicit(p)), implicit = slug === 'node' ? [] : t.props.filter(isImplicit);
  // the instances as a filterable table (component:instance-table); the toolbar state comes from the URL
  const table = instanceTable(scope.graph, slug);
  const filters = parseFilters(query, table.columns.map(c => c.name));
  // where a new instance is written (req:ontology.instance-home): the type's home document; a product type without one
  // gets its collection document — titled with its plural — on the first instance (decision:ontology.collection-document);
  // a base type's instances are written in the documents
  const homeFile = t.home ? scope.graph.modules.find(m => m.id === t.home || m.file.endsWith('/' + t.home.replace(/^module:/, '') + '.md'))?.file ?? '' : '';
  const homeRoute = homeFile ? docRoute(homeFile) : null;
  const homeTitle = homeFile ? scope.graph.modules.find(m => m.file === homeFile)?.title || homeRoute?.doc || homeFile : '';
  const base = isBaseType(t);
  return (
    <div className="page type-page">
      <header className="doc-head">
        <p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / <Link href={`/${product}/types`}>Types</Link> / {t.chain.slice(0, -1).map(id => <span key={id}><Link href={`/${product}/types/${id.slice(5)}`}>{id.slice(5)}</Link> › </span>)}{slug}</p>
        <h1 className="prop-in h1" style={{ margin: 0 }}><span className={`tag k-type`}><i />type:{slug}</span></h1>
        {t.purpose && <p className="lede">{t.purpose}</p>}
        <p className="sub">{t.extends ? <>extends <Link href={`/${product}/types/${t.extends.slice(5)}`}>{t.extends}</Link> · </> : 'the root type · '}{instances.length} instance{instances.length === 1 ? '' : 's'}{r ? <> · declared in <Link href={`/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(t.id)}`}>{r.project} / {r.doc}</Link></> : ' · base ontology (schema/base-ontology.md)'}{homeRoute && <> · instances in <Link href={`/${product}/${homeRoute.project}/d/${homeRoute.doc}`}>{homeTitle}</Link></>}{t.open && ' · open: instances may carry undeclared properties'}</p>
      </header>

      <section className="kind-section">
        <h2>Properties <span className="muted">{declared.length}</span></h2>
        <div className="ttable"><table className="type-props">
          <thead><tr><th>name</th><th>value type</th><th></th><th>inverse</th><th>from</th></tr></thead>
          <tbody>{declared.map(p => (
            <tr key={p.name} className={p.from === t.id ? 'own' : 'inherited'}>
              <td><code>{p.name}</code></td>
              <td>{p.ref ? <>{p.many ? 'list of' : 'ref'} <Link href={`/${product}/types/${p.ref}`}>{p.ref}</Link></> : p.type}</td>
              <td className="muted">{p.required ? 'required' : 'optional'}</td>
              <td>{p.inverse ? <code>{p.inverse}</code> : p.ref ? <span className="muted">{p.name}-of</span> : ''}</td>
              <td className="muted">{p.from === t.id ? '' : <Link href={`/${product}/types/${p.from.slice(5)}`}>{p.from.slice(5)}</Link>}</td>
            </tr>))}</tbody>
        </table></div>
        {implicit.length > 0 && <p className="sub" style={{ marginTop: 6 }}>…and what every node has, from <Link href={`/${product}/types/node`}>type:node</Link>: {implicit.map(p => p.name).join(', ')}.</p>}
      </section>

      {subtypes.length > 0 && <section className="kind-section"><h2>Subtypes <span className="muted">{subtypes.length}</span></h2><div className="tags">{subtypes.map(s => <Link key={s.id} className="tag k-type" href={`/${product}/types/${s.slug}`}><i />{s.slug}</Link>)}</div></section>}

      <section className="kind-section">
        <h2>Instances <span className="muted">{instances.length}</span></h2>
        {instances.length > 0 && <InstanceTable product={product} table={table} initial={filters} urlState />}
        {!base ? <AddInstance product={product} slug={slug} required={t.props.filter(p => p.required && !['title', 'status', 'text'].includes(p.name)).map(p => p.name)} home={homeRoute ? { href: `/${product}/${homeRoute.project}/d/${homeRoute.doc}`, title: homeTitle } : null} plural={pluralTitle(t)} />
          : <p className="muted">{instances.length ? '' : 'No instances yet. '}Instances of base types are written in the documents.</p>}
      </section>
    </div>
  );
}
