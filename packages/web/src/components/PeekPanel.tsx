'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import type { GraphNode } from '@/lib/graph';

type Details = { node: GraphNode; relations: { out: [string, string[]][]; inc: [string, string[]][] }; doc: { slug: string; title: string } | null };

export function PeekPanel() {
  const { project, index, openId, close } = usePeek();
  const [d, setD] = useState<Details | null>(null);
  useEffect(() => {
    if (!openId) { setD(null); return; }
    let live = true;
    fetch(`/api/p/${project}/node/${encodeURIComponent(openId)}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setD(j); });
    return () => { live = false; };
  }, [openId, project]);
  if (!openId) return null;
  const entry = index[openId];
  return (
    <aside className="peek" role="dialog" aria-label={openId}>
      <div className="peek-bar">
        {d?.doc ? <Link href={`/p/${project}/d/${d.doc.slug}#n-${encodeURIComponent(openId)}`} onClick={close}>Go to definition · {d.doc.title}</Link> : <span className="muted">{entry?.defined ? '…' : 'referenced only, no definition'}</span>}
        <Link href={`/p/${project}/graph?focus=${encodeURIComponent(openId)}&preset=Mechanics`}>Show in graph</Link>
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
