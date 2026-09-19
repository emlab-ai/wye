'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';

type Packet = { seeds: string[]; nodes: { id: string; kind: string; status: string; title: string }[] };
type Hit = { id: string; score: number; kind?: string; status?: string };
const GROUPS: { label: string; kinds: string[] }[] = [
  { label: 'What exists', kinds: ['page', 'action', 'op', 'component', 'lib', 'entity', 'store', 'tool'] },
  { label: 'Required', kinds: ['req'] },
  { label: 'Decided and constrained', kinds: ['decision', 'constraint', 'rule', 'gate', 'lesson'] },
  { label: 'Open questions', kinds: ['question', 'contradiction'] },
  { label: 'Work on this area', kinds: ['task', 'plan', 'goal'] },
];

// The Context card (req:exec.wye-context): while a librarian session reads, the product knowledge around the request
// — the constraint packet (computed) and the semantic hits — grouped by what it is: what exists, what is required,
// what is decided and constrains, open questions, work on the area; each a tag that opens the node. It fills in
// with the knowledge events the session raises and stays at the top of the column for the conversation.
export function ContextCard({ text, refs, known }: { text: string; refs: string[]; known: string[] }) {
  const { product, index } = usePeek();
  const [packet, setPacket] = useState<Packet | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/packet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, refs, budget: 12000 }) }).then(r => r.ok ? r.json() : null).then(j => { if (live && j?.nodes) setPacket(j); }).catch(() => {});
    fetch(`/api/${product}/context`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, limit: 12 }) }).then(r => r.ok ? r.json() : null).then(j => { if (live && j?.hits) setHits(j.hits); }).catch(() => {});
    return () => { live = false; };
  }, [product, text, refs]);
  const all = new Map<string, { id: string; status: string }>();
  for (const n of packet?.nodes ?? []) all.set(n.id, { id: n.id, status: n.status });
  for (const h of hits) if (!all.has(h.id)) all.set(h.id, { id: h.id, status: index[h.id]?.status ?? '' });
  for (const id of known) if (!all.has(id) && index[id]) all.set(id, { id, status: index[id].status });
  for (const id of refs) if (!all.has(id) && index[id]) all.set(id, { id, status: index[id].status });
  const groups = GROUPS.map(g => ({ ...g, items: [...all.values()].filter(n => g.kinds.includes(n.id.split(':')[0])) })).filter(g => g.items.length);
  const rest = [...all.values()].filter(n => !GROUPS.some(g => g.kinds.includes(n.id.split(':')[0])) && !['module', 'block'].includes(n.id.split(':')[0]));
  return (
    <section className="ctxcard">
      <div className="peek-bar peek-sub"><strong>Context</strong><span className="muted">{all.size ? `${all.size} node${all.size === 1 ? '' : 's'} around the request` : packet ? 'nothing close yet' : 'reading…'}</span><button className="linkish produced-toggle" onClick={() => setShown(!shown)}>{shown ? 'hide' : 'show'}</button></div>
      {shown && groups.map(g => (
        <div key={g.label} className="ctxcard-group"><small>{g.label}</small><div className="tags">{g.items.slice(0, 24).map(n => <span key={n.id} className="ctxcard-item"><SmartTag id={n.id} />{n.status && <StatusPill status={n.status} />}</span>)}</div></div>
      ))}
      {shown && rest.length > 0 && <div className="ctxcard-group"><small>Also</small><div className="tags">{rest.slice(0, 16).map(n => <SmartTag key={n.id} id={n.id} />)}</div></div>}
    </section>
  );
}
