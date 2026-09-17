'use client';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';

export type TypeRow = { id: string; slug: string; extends: string | null; purpose: string; instances: number; own: number; doc?: { href: string; label: string } };

// Rows of the Types page: the whole row opens the type in the context column; the ↗ and the parent tag are their own links.
export function TypeRows({ product, rows }: { product: string; rows: TypeRow[] }) {
  const { open } = usePeek();
  return (
    <ul className="klist klist-click">
      {rows.map(t => (
        <li key={t.id} onClick={() => open(t.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.id); } }}>
          <div className="klist-head">
            <SmartTag id={t.id} label={t.slug} />
            <Link className="klist-page" href={`/${product}/types/${t.slug}`} title="Open the type page" onClick={e => e.stopPropagation()}>↗</Link>
            {t.extends && <span className="muted" onClick={e => e.stopPropagation()}>extends <SmartTag id={t.extends} label={t.extends.slice(5)} /></span>}
            <span className="muted">{t.instances} instance{t.instances === 1 ? '' : 's'} · {t.own} own propert{t.own === 1 ? 'y' : 'ies'}</span>
            {t.doc && <Link className="klist-doc" href={t.doc.href} onClick={e => e.stopPropagation()}>{t.doc.label}</Link>}
          </div>
          {t.purpose && <div className="klist-title">{t.purpose}</div>}
        </li>
      ))}
    </ul>
  );
}
