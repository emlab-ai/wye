'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { KIND_ORDER } from '@/lib/knowledge';
import type { GraphNode } from '@/lib/graph';
import type { IndexEntry } from '@/lib/doc';

type Details = { node: GraphNode; relations: { out: [string, string[]][]; inc: [string, string[]][] } };

// How an edge reads from the open node's side.
const OUT: Record<string, string> = { refines: 'Refines', 'satisfied-by': 'Satisfied by', 'verified-by': 'Verified by', 'depends-on': 'Depends on', 'part-of': 'Part of', 'related-to': 'Related to', 'governed-by': 'Governed by', 'gated-by': 'Gated by', has: 'Has', refs: 'References', contradicts: 'Contradicts', resolves: 'Resolves', 'applies-to': 'Applies to', 'has-action': 'Actions', navigates: 'Navigates to', reads: 'Reads', writes: 'Writes' };
const INC: Record<string, string> = { refines: 'Refined by', 'satisfied-by': 'Satisfies', 'verified-by': 'Verifies', 'depends-on': 'Needed by', 'part-of': 'Contains', 'related-to': 'Related from', 'governed-by': 'Governs', 'gated-by': 'Gates', has: 'Belongs to', refs: 'Referenced by', contradicts: 'Contradicted by', resolves: 'Resolved by', 'applies-to': 'Applied by', 'has-action': 'Action of', navigates: 'Reached from', reads: 'Read by', writes: 'Written by' };

export function PeekPanel() {
  const { product, index, openId, close, hrefFor } = usePeek();
  const [d, setD] = useState<Details | null>(null);
  useEffect(() => {
    if (!openId) { setD(null); return; }
    let live = true;
    fetch(`/api/${product}/node/${encodeURIComponent(openId)}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setD(j); });
    return () => { live = false; };
  }, [openId, product]);
  if (!openId) return null;
  const entry = index[openId];
  const def = hrefFor(openId);
  return (
    <aside className="peek" role="dialog" aria-label={openId}>
      <div className="peek-bar">
        {def ? <Link href={def} onClick={close}>Go to definition</Link> : <span className="muted">{entry?.defined ? '…' : 'referenced only, no definition'}</span>}
        <Link href={`/${product}/graph?focus=${encodeURIComponent(openId)}&preset=Mechanics`}>Show in graph</Link>
        <button onClick={close}>Close</button>
      </div>
      {d ? <NodeCard id={openId} body={d.node.body} entry={entry} /> : <p className="muted">Loading {openId}…</p>}
      {d && <Relations out={d.relations.out} inc={d.relations.inc} index={index} />}
    </aside>
  );
}

// Titles come from the graph as raw markdown; the list shows them plain.
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// Every node connected to the open one, grouped by how it is connected, each row with its title and status.
function Relations({ out, inc, index }: { out: [string, string[]][]; inc: [string, string[]][]; index: Record<string, IndexEntry> }) {
  const groups = [...out.map(([v, ids]) => ({ key: 'o' + v, label: OUT[v] ?? `${v} →`, ids })), ...inc.map(([v, ids]) => ({ key: 'i' + v, label: INC[v] ?? `← ${v}`, ids }))];
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const rank = (id: string) => { const k = KIND_ORDER.indexOf(id.split(':')[0]); return k < 0 ? 99 : k; };
  if (!total) return <p className="muted rels-empty">Nothing links to or from this node yet.</p>;
  return (
    <div className="rels">
      <h4>Connected <span className="muted">{total}</span></h4>
      {groups.map(g => (
        <section key={g.key}>
          <h5>{g.label} <span className="muted">{g.ids.length}</span></h5>
          <ul>
            {[...g.ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(id => {
              const e = index[id];
              return <li key={id}><SmartTag id={id} />{e?.status && <StatusPill status={e.status} />}<span className="rt">{e?.title && e.title !== id ? plain(e.title) : ''}</span></li>;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
