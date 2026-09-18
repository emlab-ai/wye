'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { countsLine, type ChangeGroup, type ChangeRow } from '@/lib/session-changes';

type Data = { counts: { added: number; changed: number; removed: number; prose: number }; groups: ChangeGroup[] };
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');


// Everything a session changed in the knowledge base, block by block, per document: badge, tag, title; a row opens
// the node in the context column; paragraphs folded; chips filter by change and by kind. Fetches op:api.sessions.changes
// and refetches on every graph change while the session runs.
export function SessionChanges({ product, id, initial, live }: { product: string; id: string; initial?: Data; live?: boolean }) {
  const { open } = usePeek();
  const [data, setData] = useState<Data | null>(initial ?? null);
  const [change, setChange] = useState('');
  const [kind, setKind] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!live) return;
    const h = (e: Event) => { const d = (e as CustomEvent<{ kinds: string[] }>).detail; if (d.kinds.includes('graph') || d.kinds.includes('session')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, [live]);
  useEffect(() => {
    if (initial && version === 0) return;
    let on = true;
    fetch(`/api/${product}/sessions/${id}/changes`).then(r => r.ok ? r.json() : null).then(j => { if (on && j) setData(j); });
    return () => { on = false; };
  }, [product, id, version, initial]);
  if (!data) return <p className="muted small">Loading changes…</p>;
  const all = data.groups.flatMap(g => g.rows);
  const kinds = [...new Set(all.map(r => r.kind))].sort();
  const keep = (r: ChangeRow) => (!change || r.change === change) && (!kind || r.kind === kind);
  const groups = data.groups.map(g => ({ ...g, rows: g.rows.filter(keep), prose: kind ? [] : g.prose.filter(r => !change || r.change === change) })).filter(g => g.rows.length || g.prose.length);
  if (!all.length && !data.counts.prose) return <p className="muted small">This session changed nothing in the knowledge base{live ? ' yet' : ''}.</p>;
  return (
    <div className="schanges">
      <div className="track-tools schanges-tools">
        <div className="chips">
          {(['added', 'changed', 'removed'] as const).filter(c => data.counts[c]).map(c => <button key={c} className={`chip ch-${c} ${change === c ? 'on' : ''}`} onClick={() => setChange(change === c ? '' : c)}>{c} <small>{data.counts[c]}</small></button>)}
          {kinds.length > 1 && <span className="chips-label" style={{ marginLeft: 8 }}>kind</span>}
          {kinds.length > 1 && kinds.map(k => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(kind === k ? '' : k)}>{k} <small>{all.filter(r => r.kind === k).length}</small></button>)}
        </div>
      </div>
      {groups.map(g => (
        <section key={g.doc} className="schanges-doc">
          <h5><SmartTag id={g.doc} /><small className="muted">{countsLine({ added: g.rows.filter(r => r.change === 'added').length, changed: g.rows.filter(r => r.change === 'changed').length, removed: g.rows.filter(r => r.change === 'removed').length, prose: 0 })}</small></h5>
          <ul className="schanges-list">
            {g.rows.map(r => (
              <li key={r.id} className={`schange ch-${r.change} ${r.exists ? '' : 'gone'}`} onClick={() => r.exists && open(r.id)} role={r.exists ? 'button' : undefined} title={r.exists ? 'open in the context column' : 'no longer in the documents'}>
                <span className={`badge ch-${r.change}`}>{r.change === 'added' ? '+' : r.change === 'changed' ? '~' : '−'}</span>
                <SmartTag id={r.id} />{r.status && <StatusPill status={r.status} />}
                <span className="schange-title">{r.text !== r.id && !r.id.endsWith(':' + r.text) ? plain(r.text) : ''}</span>
              </li>))}
          </ul>
          {g.prose.length > 0 && <details className="schanges-prose"><summary className="muted small">{g.prose.length} paragraph{g.prose.length === 1 ? '' : 's'} {change || 'added or changed'}</summary>
            <ul className="schanges-list">{g.prose.map(r => <li key={r.id} className={`schange ch-${r.change} ${r.exists ? '' : 'gone'}`} onClick={() => r.exists && open(r.id)}><span className={`badge ch-${r.change}`}>{r.change === 'added' ? '+' : r.change === 'changed' ? '~' : '−'}</span><span className="schange-title">{plain(r.text).slice(0, 160)}</span></li>)}</ul>
          </details>}
        </section>))}
    </div>
  );
}
