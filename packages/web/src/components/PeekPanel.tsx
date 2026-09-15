'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import type { GraphNode } from '@/lib/graph';

type Details = { node: GraphNode; relations: { out: [string, string[]][]; inc: [string, string[]][] } };

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
      {d && (
        <div className="rels">
          {d.relations.out.map(([verb, ids]) => <div key={'o' + verb}><h5>{verb} →</h5><div className="tags">{ids.map(i => <SmartTag key={i} id={i} />)}</div></div>)}
          {d.relations.inc.map(([verb, ids]) => <div key={'i' + verb}><h5>← {verb} by</h5><div className="tags">{ids.map(i => <SmartTag key={i} id={i} />)}</div></div>)}
        </div>
      )}
    </aside>
  );
}
