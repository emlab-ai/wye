import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { KIND_LABELS } from '@/lib/knowledge';
import { docRoute } from '@/lib/doc';
import { SmartTag } from '@/components/SmartTag';
import { StatusPill } from '@/components/Pills';

// One kind of knowledge as a list: title, status, where it is defined, and what it relates to.
export default async function KindPage({ params }: { params: Promise<{ product: string; kind: string }> }) {
  const { product, kind } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const items = scope.graph.nodes.filter(n => n.defined && n.kind === kind).sort((a, b) => a.id.localeCompare(b.id));
  if (!items.length) notFound();
  return (
    <div className="page">
      <header className="doc-head"><p className="crumbs"><Link href={`/${product}/knowledge`}>Knowledge</Link> / {KIND_LABELS[kind] ?? kind}</p><h1 className="prop-in h1" style={{ margin: 0 }}>{KIND_LABELS[kind] ?? kind} <span className="muted">{items.length}</span></h1></header>
      <ul className="klist">
        {items.map(n => {
          const r = docRoute(n.file);
          const outs = (scope.idx.out.get(n.id) ?? []).filter(e => e.verb !== 'mentions' && e.verb !== 'has').slice(0, 6);
          return (
            <li key={n.id}>
              <div className="klist-head"><SmartTag id={n.id} /><StatusPill status={n.status} />{r && <Link className="klist-doc" href={`/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(n.id)}`}>{r.project} / {r.doc}</Link>}</div>
              <div className="klist-title">{n.title !== n.id ? n.title : ''}</div>
              {outs.length > 0 && <div className="klist-rels">{outs.map(e => <span key={e.verb + e.to} className="klist-rel"><small>{e.verb}</small><SmartTag id={e.to} /></span>)}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
