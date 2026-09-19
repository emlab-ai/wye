'use client';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import type { Constitutional } from '@/lib/constitution';

const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

export function ConstitutionList({ product, rows }: { product: string; rows: Constitutional[] }) {
  const { open } = usePeek();
  if (!rows.length) return <p className="muted">No constraints yet. Write one as a <code>constraint:</code> block in the document it belongs to — <code>constraint:{product}.local-first Every write lands on this machine first #proposed</code> — and approve it in the inbox.</p>;
  return (
    <ul className="qlist">
      {rows.map(r => (
        <li key={r.id} className={`qrow ${r.status === 'approved' ? '' : 'done'}`} onClick={() => open(r.id)}>
          <div className="qhead"><span className="pill k" style={{ background: 'var(--k-rule)' }}>{r.id.slice(r.id.indexOf(':') + 1)}</span><span className="qtitle">{plain(r.statement)}</span><StatusPill status={r.status} /></div>
          {(r.scope.length > 0 || r.rationale) && <div className="tags">{r.scope.map(x => <SmartTag key={x} id={x} />)}{r.rationale && <SmartTag id={r.rationale} />}</div>}
        </li>
      ))}
    </ul>
  );
}
