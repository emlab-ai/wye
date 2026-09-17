'use client';
import { useEffect, useState } from 'react';
import { PeekGraph, type LiteNode } from './PeekGraph';
import { ContextPanel } from './ContextPanel';
import { SessionView } from './SessionView';
import { requestSend } from './SendToAgent';
import type { GraphEdge } from '@/lib/graph';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { NodeCard } from './NodeCard';
import { NodeEditor } from './NodeEditor';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { KIND_ORDER } from '@/lib/knowledge';
import { ProgressBar } from './Progress';
import { TrackEditor } from './TrackEditor';
import { Produced } from './Produced';
import { DocPeek } from './DocPeek';
import { TypeView } from './TypeView';
import type { GraphNode, TypeDef } from '@/lib/graph';
import type { NodeProp } from '@/lib/types';
import type { IndexEntry } from '@/lib/doc';

type Details = { node: GraphNode; relations: { out: [string, string[]][]; inc: [string, string[]][] }; graph: { nodes: LiteNode[]; edges: GraphEdge[] }; type?: TypeDef | null; props?: NodeProp[]; inverses?: Record<string, string>; self?: TypeDef | null; instances?: { id: string; title: string; status: string }[] };

// How an edge reads from the open node's side.
const OUT: Record<string, string> = { refines: 'Refines', 'satisfied-by': 'Satisfied by', 'verified-by': 'Verified by', 'depends-on': 'Depends on', 'part-of': 'Part of', 'related-to': 'Related to', 'governed-by': 'Governed by', 'gated-by': 'Gated by', has: 'Has', refs: 'References', contradicts: 'Contradicts', resolves: 'Resolves', 'applies-to': 'Applies to', 'has-action': 'Actions', navigates: 'Navigates to', reads: 'Reads', writes: 'Writes', produced: 'Produced' };
const INC: Record<string, string> = { refines: 'Refined by', 'satisfied-by': 'Satisfies', 'verified-by': 'Verifies', 'depends-on': 'Needed by', 'part-of': 'Contains', 'related-to': 'Related from', 'governed-by': 'Governs', 'gated-by': 'Gates', has: 'Belongs to', refs: 'Referenced by', contradicts: 'Contradicted by', resolves: 'Resolved by', 'applies-to': 'Applied by', 'has-action': 'Action of', navigates: 'Reached from', reads: 'Read by', writes: 'Written by', produced: 'Produced by' };

export function PeekPanel() {
  const { product, index, openId, stack, cursor, go, back, togglePin, remove, close, showContext, editing, setPanelOpen } = usePeek();
  if (!openId && !showContext && !stack.length) return null;
  const chips = (
    <div className="peek-nav">
      <button className="peek-back" onClick={back} disabled={cursor < 0} title="Back (Esc)">←</button>
      <div className="peek-chips">
        {showContext && <button className={`chip ${cursor < 0 ? 'on' : ''}`} onClick={() => go(-1)} title="Follows the block you are editing">◈ Context</button>}
        {stack.map((e, i) => {
          const en = index[e.id]; const kind = e.id.split(':')[0];
          const label = kind === 'session' ? `session ${e.id.slice(8, 14)}` : e.id.replace(/^req:/, '');
          return (
            <span key={e.id + i} className={`chip peek-chip k-${kind} ${i === cursor ? 'on' : ''} ${e.pinned ? 'pinned' : ''}`} title={en?.title || e.id}>
              <button className="peek-chip-go" onClick={() => go(i)}><i style={{ background: `var(--k-${kind}, var(--k-other))` }} />{label}</button>
              <button className="peek-chip-pin" onClick={() => togglePin(i)} title={e.pinned ? 'Unpin' : 'Pin: keep this item in the bar'}>{e.pinned ? '📌' : '📍'}</button>
              {e.pinned || <button className="peek-chip-x" onClick={() => remove(i)} title="Remove">×</button>}
            </span>
          );
        })}
      </div>
      <button className="peek-bar-close" onClick={() => { if (showContext) setPanelOpen(false); else close(); }} title="Hide the panel (⌘.)">×</button>
    </div>
  );
  // Context root: the node the cursor is in (its details first), then knowledge related to what is being written
  if (!openId) return (
    <aside className="peek" role="complementary" aria-label="Context">
      {chips}
      {editing?.nodeId
        ? <><NodeView id={editing.nodeId} /><div className="peek-bar peek-sub"><strong>Related</strong><span className="muted">knowledge close to what you are writing</span></div><ContextPanel /></>
        : <><div className="peek-bar"><strong>Context</strong><span className="muted">{editing ? 'for the block you are editing' : 'put the cursor in the text'}</span></div><ContextPanel /></>}
    </aside>
  );
  if (openId.startsWith('session:')) return (
    <aside className="peek" role="dialog" aria-label={openId}>
      {chips}
      <div className="peek-bar"><strong>Session</strong><Link href={`/${product}/sessions`}>All sessions</Link></div>
      <SessionView id={openId.slice('session:'.length)} />
    </aside>
  );
  return <aside className="peek" role="dialog" aria-label={openId}>{chips}<NodeView id={openId} /></aside>;
}

// One node in the column: card or editor, what it produced, and what it is connected to (list or graph).
function NodeView({ id }: { id: string }) {
  const { product, index, open, go, hrefFor } = usePeek();
  const [d, setD] = useState<Details | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [depth, setDepth] = useState<1 | 2>(1);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true; setD(null);
    fetch(`/api/${product}/node/${encodeURIComponent(id)}?depth=${depth}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setD(j); });
    return () => { live = false; };
  }, [id, product, depth, tick]);
  const entry = index[id];
  const def = hrefFor(id);
  if (entry?.kind === 'module' && def) return (
    <>
      <div className="peek-bar">
        <Link href={def.replace(/#.*$/, '')} className="pri-link">Open document →</Link>
        <Link href={`/${product}/graph?focus=${encodeURIComponent(id)}&preset=Mechanics`}>Show in graph</Link>
        <button className="linkish" onClick={() => requestSend({ refs: [id], text: entry.title })}>Send to agent</button>
      </div>
      <DocPeek id={id} href={def.replace(/#.*$/, '')} />
      {d && <><div className="peek-views"><h4>Connected <span className="muted">{[...d.relations.out, ...d.relations.inc].filter(([v]) => v !== 'mentions').reduce((n, [, ids]) => n + ids.length, 0)}</span></h4></div><Relations out={d.relations.out} inc={d.relations.inc} index={index} inverses={d.inverses} /></>}
    </>
  );
  return (
    <>
      <div className="peek-bar">
        {id.startsWith('type:') && <Link href={`/${product}/types/${id.slice(5)}`} className="pri-link">Open type page →</Link>}
        {def ? <Link href={def} onClick={() => go(-1)}>Go to definition</Link> : id.startsWith('type:') ? null : <span className="muted">{entry?.defined ? '…' : 'referenced only, no definition'}</span>}
        <Link href={`/${product}/graph?focus=${encodeURIComponent(id)}&preset=Mechanics`}>Show in graph</Link>
        <button className="linkish" onClick={() => requestSend({ refs: [id], text: d ? nodeText(d.node.body) : entry?.title })}>Send to agent</button>
      </div>
      {d && d.self && <TypeView type={d.self} instances={d.instances ?? []} index={index} product={product} onSaved={() => setTick(t => t + 1)} />}
      {d && d.self ? null : d && (entry?.kind === 'goal' || entry?.kind === 'task')
        ? <><TrackEditor key={entry.id} entry={entry} index={index} text={nodeText(d.node.body)} form={d.node.form} onSaved={() => setTick(t => t + 1)} />{entry.sessions && entry.sessions.length > 0 && <Produced sessions={entry.sessions} produced={(d.relations.out.find(([v]) => v === 'produced')?.[1]) ?? []} />}<Tracking entry={entry} index={index} inc={d.relations.inc} /></>
        : d && d.node.defined && d.type ? <NodeEditor key={id} id={id} body={d.node.body} form={d.node.form ?? 'yaml'} type={d.type} props={d.props ?? []} entry={entry} onSaved={() => setTick(t => t + 1)} />
        : d ? <NodeCard id={id} body={d.node.body} entry={entry} /> : <p className="muted">Loading {id}…</p>}
      {d && d.type && d.props && d.relations.inc.some(([v]) => (d.inverses ?? {})[v]) && <Properties type={d.type} props={[]} inc={d.relations.inc} inverses={d.inverses ?? {}} product={product} />}
      {d && (
        <div className="peek-views">
          <h4>Connected <span className="muted">{[...d.relations.out, ...d.relations.inc].filter(([v]) => v !== 'mentions').reduce((n, [, ids]) => n + ids.length, 0)}</span></h4>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
            <button role="tab" aria-selected={view === 'graph'} className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>Graph</button>
          </div>
          {view === 'graph' && <div className="seg small" title="how many hops from this node"><button className={depth === 1 ? 'on' : ''} onClick={() => setDepth(1)}>1 hop</button><button className={depth === 2 ? 'on' : ''} onClick={() => setDepth(2)}>2 hops</button></div>}
        </div>
      )}
      {d && view === 'list' && <Relations out={d.relations.out} inc={d.relations.inc} index={index} inverses={d.inverses} />}
      {d && view === 'graph' && (d.graph.nodes.length > 1 ? <PeekGraph focus={id} nodes={d.graph.nodes} edges={d.graph.edges} onPick={open} /> : <p className="muted rels-empty">Nothing links to or from this node yet.</p>)}
    </>
  );
}

// Titles come from the graph as raw markdown; the list shows them plain.
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// Every node connected to the open one, grouped by how it is connected, each row with its title and status.
function Relations({ out, inc, index, inverses = {} }: { out: [string, string[]][]; inc: [string, string[]][]; index: Record<string, IndexEntry>; inverses?: Record<string, string> }) {
  // generated 'mentions' edges (a node's text naming a field) are noise next to real relations; an incoming edge
  // reads by its inverse name (the ontology's, else the built-in label)
  const groups = [...out.filter(([v]) => v !== 'mentions').map(([v, ids]) => ({ key: 'o' + v, label: OUT[v] ?? `${v} →`, ids })), ...inc.filter(([v]) => v !== 'mentions').map(([v, ids]) => ({ key: 'i' + v, label: INC[v] ?? (inverses[v] ? inverses[v] : `← ${v}`), ids }))];
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const rank = (id: string) => { const k = KIND_ORDER.indexOf(id.split(':')[0]); return k < 0 ? 99 : k; };
  if (!total) return <p className="muted rels-empty">Nothing links to or from this node yet.</p>;
  return (
    <div className="rels">
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

// A typed node's properties: every effective property of its type (own and inherited), filled or as a placeholder
// with its value type, then the inverses — incoming links named from this side (memberOf: team:platform).
function Properties({ type, props, inc, inverses, product }: { type: TypeDef; props: NodeProp[]; inc: [string, string[]][]; inverses: Record<string, string>; product: string }) {
  const shown = props.filter(p => (p.from !== 'type:node' && !['title', 'status', 'text'].includes(p.name)) || (p.value && !['title', 'status', 'text'].includes(p.name)));
  const back = inc.filter(([v]) => inverses[v]).map(([v, ids]) => ({ name: inverses[v], ids }));
  const ids = (v: string) => v.replace(/^\[|\]$/g, '').split(/,\s*/).map(x => x.trim()).filter(Boolean);
  return (
    <section className="props">
      <h4>{shown.length ? 'Properties' : 'Linked from'} <span className="muted"><Link href={`/${product}/types/${type.slug}`}>type:{type.slug}</Link></span></h4>
      <dl className="strip">
        {shown.map(p => (
          <div key={p.name} className={p.value ? '' : 'empty'}>
            <dt title={p.from === type.id ? `declared on ${type.id}` : `inherited from ${p.from}`}>{p.name}{p.from !== type.id && <small> {p.from.slice(5)}</small>}</dt>
            <dd>{p.value ? (p.ref ? <span className="list">{ids(p.value).map(x => <span key={x} className="item">{/^[a-z][a-z0-9-]*:/.test(x) ? <SmartTag id={x} /> : x}</span>)}</span> : p.value) : <span className="muted">{p.ref ? `${p.many ? 'list of' : 'ref'} ${p.ref}` : p.type}{p.required ? ' · required' : ''}</span>}</dd>
          </div>))}
        {back.length > 0 && <div className="divider"><dt /><dd /></div>}
        {back.map(b => <div key={b.name} className="inverse"><dt title="inverse: not written here, derived from the other side">{b.name}</dt><dd><span className="list">{b.ids.map(id => <span key={id} className="item"><SmartTag id={id} /></span>)}</span></dd></div>)}
      </dl>
    </section>
  );
}

// Goal / task tracking: status, target, owner, progress and what contributes to it.
function Tracking({ entry, index, inc }: { entry: IndexEntry; index: Record<string, IndexEntry>; inc: [string, string[]][] }) {
  const parts = (inc.find(([v]) => v === 'part-of')?.[1] ?? []).map(id => index[id]).filter(Boolean);
  const byKind = (k: string) => parts.filter(p => p.kind === k);
  const done = (p: IndexEntry) => ['done', 'complete', 'shipped'].includes(p.status) || (p.progress ?? 0) >= 100;
  return (
    <section className="tracking">
      {entry.kind === 'goal' && (['goal', 'task', 'req'] as const).map(k => {
        const items = byKind(k); if (!items.length) return null;
        const label = k === 'goal' ? 'Sub-goals' : k === 'task' ? 'Tasks' : 'Requirements';
        return (
          <div key={k} className="tracking-parts">
            <h5>{label} <span className="muted">{items.filter(done).length}/{items.length}</span></h5>
            <ul>{items.map(p => <li key={p.id} className={done(p) ? 'done' : ''}><SmartTag id={p.id} /><StatusPill status={p.status} />{p.progress !== undefined && k === 'goal' && <span className="tpct">{p.progress}%</span>}<span className="rt">{p.title !== p.id ? plain(p.title) : ''}</span></li>)}</ul>
          </div>
        );
      })}

    </section>
  );
}

// The text of a node body for a session: its text/statement/description line.
function nodeText(body: string): string {
  const m = body.match(/^(?:text|statement|description|title):\s*(.+)$/m); return m ? m[1] : '';
}
