import Link from 'next/link';

// A product or project that is not here (decision:wf2.deleted-outside-stays-put): the notice is a page of the app
// with the way out — never the framework's bare 404. A product goes when its folder is removed or moved without the
// app (a scratch product deleted, a git checkout); a project when its folder leaves the product.
export function GoneNotice({ what, slug, product, products = [], projects = [] }: { what: 'product' | 'project'; slug: string; product?: string; products?: { slug: string; title: string; icon: string }[]; projects?: { slug: string; title: string; icon: string }[] }) {
  return (
    <div className="page gone-notice" role="status" style={{ maxWidth: 640, margin: '10vh auto', padding: '0 24px' }}>
      <h1 style={{ marginBottom: 6 }}>{what === 'product' ? 'This product is not here' : 'This project is not here'}</h1>
      <p className="muted">{what === 'product' ? <>There is no product <code>{slug}</code> under the app&apos;s data right now — its folder was removed or moved outside the app, or the address is wrong.</> : <>There is no project <code>{slug}</code> in <code>{product}</code> right now — its folder was removed or moved, or the address is wrong.</>}</p>
      {what === 'product' && (products.length ? <>
        <p>Products that are here:</p>
        <ul className="gone-list">{products.map(p => <li key={p.slug}><Link href={`/${p.slug}`}>{p.icon ? `${p.icon} ` : ''}{p.title}</Link> <span className="muted">/{p.slug}</span></li>)}</ul>
      </> : <p>No products yet — <Link href="/new">create one</Link>.</p>)}
      {what === 'project' && <>
        {projects.length > 0 && <><p>Projects of {product}:</p><ul className="gone-list">{projects.map(p => <li key={p.slug}><Link href={`/${product}/${p.slug}`}>{p.icon ? `${p.icon} ` : ''}{p.title}</Link> <span className="muted">/{p.slug}</span></li>)}</ul></>}
        <p><Link href={`/${product}`}>← {product}</Link></p>
      </>}
    </div>
  );
}
