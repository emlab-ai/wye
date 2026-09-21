'use client';
import { useEffect, useState } from 'react';
import { PeekGraph, type LiteNode } from './PeekGraph';
import { ContextPanel } from './ContextPanel';
import { SessionView } from './SessionView';
import { requestSend } from './CommandBox';
import type { GraphEdge } from '@/lib/graph';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { NodeCard } from './NodeCard';
import { NodeEditor } from './NodeEditor';
import { TabStrip, type Tab } from './Tabs';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { KIND_ORDER } from '@/lib/knowledge';
import { ProgressBar } from './Progress';
import { Produced } from './Produced';
import { TaskWork } from './TaskWork';
import { ChangedBadge } from './ChangedBadge';
import { ExplainCard } from './ExplainCard';
import { DocPeek } from './DocPeek';
import { EmbeddedCard } from './EmbeddedCard';
import { TypeView } from './TypeView';
import { InstanceTable } from './InstanceTable';
import { EMPTY_FILTERS, type InstanceTable as Table } from '@/lib/instance-table';
import { Comments } from './Comments';
import { HooksSection } from './HooksSection';
import dynamic from 'next/dynamic';
const DocEditor = dynamic(() => import('./DocEditor'), { ssr: false });
import type { GraphNode, TypeDef } from '@/lib/graph';
import type { NodeProp } from '@/lib/types';
import type { IndexEntry } from '@/lib/doc';

type Details = { node: GraphNode; relations: { out: [string, string[]][]; inc: [string, string[]][] }; graph: { nodes: LiteNode[]; edges: GraphEdge[] }; type?: TypeDef | null; props?: NodeProp[]; inverses?: Record<string, string>; self?: TypeDef | null; instances?: { id: string; title: string; status: string }[] };

// How an edge reads from the open node's side.
const OUT: Record<string, string> = { refines: 'Refines', 'satisfied-by': 'Satisfied by', 'verified-by': 'Verified by', 'depends-on': 'Depends on', 'part-of': 'Part of', 'related-to': 'Related to', 'governed-by': 'Governed by', 'gated-by': 'Gated by', has: 'Has', refs: 'References', contradicts: 'Contradicts', resolves: 'Resolves', 'applies-to': 'Applies to', 'has-action': 'Actions', navigates: 'Navigates to', reads: 'Reads', writes: 'Writes', produced: 'Produced' };
const INC: Record<string, string> = { refines: 'Refined by', 'satisfied-by': 'Satisfies', 'verified-by': 'Verifies', 'depends-on': 'Needed by', 'part-of': 'Contains', 'related-to': 'Related from', 'governed-by': 'Governs', 'gated-by': 'Gates', has: 'Belongs to', refs: 'Referenced by', contradicts: 'Contradicted by', resolves: 'Resolved by', 'applies-to': 'Applied by', 'has-action': 'Action of', navigates: 'Reached from', reads: 'Read by', writes: 'Written by', produced: 'Produced by' };

export function PeekPanel() {
  const { product, index, openId, stack, cursor, go, back, togglePin, remove, showContext, editing, focused, setPanelOpen, relatedOpen, setRelatedOpen } = usePeek();
  if (!openId && !showContext && !stack.length) return null;
  // the column's tabs (req:wf2.ui.tabs): Context first on document pages, then every node or session opened
  const tabs: Tab[] = [
    ...(showContext ? [{ key: '', label: 'Context', icon: '◈', title: 'Follows the block you are editing', fixed: true }] : []),
    ...stack.map((e, i) => { const en = index[e.id]; const kind = e.id.split(':')[0]; return { key: `${i}:${e.id}`, label: kind === 'session' ? `session ${e.id.slice(8, 14)}` : (en?.title ? plain(en.title) : e.id.replace(/^req:/, '')), icon: <i className="tab-dot" style={{ background: `var(--k-${kind}, var(--k-other))` }} />, title: e.id, pinned: e.pinned }; }),
  ];
  const at = (key: string) => Number(key.split(':')[0]);
  const chips = (
    <TabStrip label="Open in the context column" tabs={tabs} active={cursor < 0 ? '' : `${cursor}:${stack[cursor]?.id}`}
      onPick={k => go(k === '' ? -1 : at(k))} onClose={k => { if (k !== '') remove(at(k)); }} onPin={k => { if (k !== '') togglePin(at(k)); }}
      before={<button className="peek-back" onClick={back} disabled={cursor < 0} title="Back (Esc)">←</button>}
      after={<button className="peek-bar-close" onClick={() => setPanelOpen(false)} title="Hide the panel (⌘.)">×</button>} />
  );
  // The column is a frame (rule:column-frame): the bar stays, .peek-body is the one scroller under it.
  // Context root: the node a click selected, else the node the cursor is in (its details first), then knowledge
  // related to what is being written — only when the caret is in that block (an embed's selection has no caret)
  const rootId = focused ?? editing?.nodeId;
  if (!openId) return (
    <aside className="peek" role="complementary" aria-label="Context">
      {chips}
      <div className="peek-body">
        {rootId
          ? <><NodeView id={rootId} />{(!focused || focused === editing?.nodeId) && <Related open={relatedOpen} setOpen={setRelatedOpen} sub />}</>
          : <><div className="peek-bar"><strong>Context</strong><span className="muted">{editing ? 'for the block you are editing' : 'put the cursor in the text'}</span></div>{editing ? <Related open={relatedOpen} setOpen={setRelatedOpen} /> : <ContextPanel />}</>}
      </div>
    </aside>
  );
  // a session's message box sticks to the bottom of the scroller, so the body has no padding under it
  if (openId.startsWith('session:')) return (
    <aside className="peek" role="dialog" aria-label={openId}>
      {chips}
      <div className="peek-body peek-session">
        <div className="peek-bar"><strong>Session</strong><Link href={`/${product}/sessions`}>All sessions</Link></div>
        <SessionView id={openId.slice('session:'.length)} />
      </div>
    </aside>
  );
  return <aside className="peek" role="dialog" aria-label={openId}>{chips}<div className="peek-body"><NodeView id={openId} /></div></aside>;
}

// One node in the column: card or editor, what it produced, and what it is connected to (list or graph).
function NodeView({ id }: { id: string }) {
  const { product, index, open, go, hrefFor } = usePeek();
  const [d, setD] = useState<Details | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [depth, setDepth] = useState<1 | 2>(1);
  const [tick, setTick] = useState(0);
  // the connected rows opened as cards (rule:connected-cards): forgotten when another node opens, kept over a refetch
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const toggle = (ids: string[], on?: boolean) => setOpened(cur => { const next = new Set(cur); for (const x of ids) { if (on ?? !next.has(x)) next.add(x); else next.delete(x); } return next; });
  useEffect(() => { setOpened(new Set()); }, [id]);
  useEffect(() => {
    let live = true; setD(null);
    fetch(`/api/${product}/node/${encodeURIComponent(id)}?depth=${depth}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setD(j); });
    return () => { live = false; };
  }, [id, product, depth, tick]);
  const rows = { index, opened, toggle };
  const entry = index[id];
  const def = hrefFor(id);
  const kind = id.split(':')[0];
  const linkCount = d ? [...d.relations.out.filter(([v]) => v !== 'has'), ...withoutComments(d.relations.inc)].filter(([v]) => v !== 'mentions').reduce((n, [, ids]) => n + ids.length, 0) : 0;
  // the header: kind and id on the left (the type it belongs to after them), icon actions on the right — the way
  // Notion and Asana put a page's tools in one quiet row instead of a line of links
  const head = (
    <header className="node-head">
      <div className="node-ident">
        <span className="node-kind" style={{ '--k': `var(--k-${kind}, var(--k-other))` } as React.CSSProperties}><i />{kind}</span>
        <code className="node-id" title="click to copy the id" onClick={() => { navigator.clipboard?.writeText(id).catch(() => {}); }}>{id.slice(kind.length + 1)}</code>
        {d?.type && !d.self && d.type.slug !== kind && <Link className="node-type" href={`/${product}/types/${d.type.slug}`} title="the type this node belongs to">{d.type.slug}</Link>}
        {!entry?.defined && !id.startsWith('type:') && <span className="muted node-stub">referenced only</span>}
        {entry?.defined && <ChangedBadge key={`chg-${id}`} id={id} />}
      </div>
      <div className="node-tools" role="toolbar" aria-label="Node actions">
        {entry?.doc && def && <Link href={def.replace(/#.*$/, '')} className="tool" title="Open the document">↗</Link>}
        {!entry?.doc && def && <Link href={def} className="tool" title="Go to the definition in its document" onClick={() => go(-1)}>↗</Link>}
        {id.startsWith('type:') && <Link href={`/${product}/types/${id.slice(5)}`} className="tool" title="Open the type page">↗</Link>}
        <Link href={`/${product}/graph?focus=${encodeURIComponent(id)}&preset=Mechanics`} className="tool" title="Show in the graph">⌬</Link>
        <button className="tool" title="Send to an agent" onClick={() => requestSend({ refs: [id], text: d ? nodeText(d.node.body) || entry?.title : entry?.title })}>⇢</button>
        <button className="tool" title="Capture a task about this for later (unassigned, on the Work view)" onClick={() => requestSend({ refs: [id], text: '' })}>＋</button>
      </div>
    </header>
  );
  if (entry?.doc && def) return (
    <>
      {head}
      <DocPeek id={id} href={def.replace(/#.*$/, '')} />
      <Comments key={`comments-${id}`} id={id} />
      {d && <><div className="peek-views"><h4>Links <span className="muted">{linkCount}</span></h4></div><Relations out={d.relations.out} inc={withoutComments(d.relations.inc)} rows={rows} inverses={d.inverses} /></>}
    </>
  );
  return (
    <>
      {head}
      {d && d.self && <TypeView type={d.self} instances={d.instances ?? []} index={index} product={product} onSaved={() => setTick(t => t + 1)} />}
      {d && d.self ? null : d && d.node.defined && d.type
        ? <><NodeEditor key={id} id={id} body={d.node.body} form={d.node.form ?? 'yaml'} type={d.type} props={d.props ?? []} entry={entry} relations={d.relations.out} onSaved={() => setTick(t => t + 1)} />
          {entry && entry.kind === 'task' && <TaskWork key={`work-${id}`} id={id} />}</>
        : d ? <NodeCard id={id} body={d.node.body} entry={entry} /> : <p className="muted">Loading {id}…</p>}
      {d && !d.self && d.node.defined && <NodeContent id={id} />}
      {/* a goal: what serves it as data tables under its content — requirements, then tasks; sub-goals in the tracking block */}
      {d && !d.self && entry && (entry.kind === 'goal' || entry.kind === 'task') && <Tracking entry={entry} rows={rows} inc={d.relations.inc} />}
      {d && !d.self && entry?.kind === 'goal' && <PartsTable key={`reqs-${id}`} id={id} kind="req" label="Requirements" ids={(d.relations.inc.find(([v]) => v === 'part-of')?.[1] ?? []).filter(x => x.startsWith('req:'))} />}
      {d && !d.self && entry?.kind === 'goal' && <PartsTable key={`tasks-${id}`} id={id} kind="task" label="Tasks" ids={(d.relations.inc.find(([v]) => v === 'part-of')?.[1] ?? []).filter(x => x.startsWith('task:'))} />}
      {d && !d.self && d.node.defined && <Comments key={`comments-${id}`} id={id} />}
      {d && !d.self && d.node.defined && <ExplainCard key={`explain-${id}`} id={id} />}
      {d && !d.self && d.node.defined && <HooksSection key={`hooks-${id}`} id={id} />}
      {d && d.type && d.props && withoutComments(d.relations.inc).some(([v]) => (d.inverses ?? {})[v]) && <Properties type={d.type} props={[]} inc={withoutComments(d.relations.inc)} inverses={d.inverses ?? {}} product={product} folded />}
      {d && (
        <div className="peek-views">
          <h4>Links <span className="muted">{linkCount}</span></h4>
          {view === 'graph' && <span className="seg small" title="how many hops from this node"><button className={depth === 1 ? 'on' : ''} onClick={() => setDepth(1)}>1 hop</button><button className={depth === 2 ? 'on' : ''} onClick={() => setDepth(2)}>2 hops</button></span>}
          <button className={`tool ${view === 'graph' ? 'on' : ''}`} onClick={() => setView(v => v === 'list' ? 'graph' : 'list')} title={view === 'graph' ? 'Show as a list' : 'Show as a graph'} aria-pressed={view === 'graph'}>⌬</button>
        </div>
      )}
      {d && view === 'list' && <Relations out={d.relations.out} inc={withoutComments(d.relations.inc)} rows={rows} inverses={d.inverses} />}
      {d && view === 'graph' && (d.graph.nodes.length > 1 ? <PeekGraph focus={id} nodes={d.graph.nodes} edges={d.graph.edges} onPick={open} /> : <p className="muted rels-empty">Nothing links to or from this node yet.</p>)}
      {/* what a goal's or task's sessions produced: last, folded (req:wf2.ui.produced-collapsed); keyed so the fold closes with the node */}
      {d && entry && (entry.kind === 'goal' || entry.kind === 'task') && entry.sessions && entry.sessions.length > 0 && <Produced key={id} sessions={entry.sessions} produced={(d.relations.out.find(([v]) => v === 'produced')?.[1]) ?? []} />}
    </>
  );
}

// Related — the knowledge nearest to the block being written (rule:context-panel) — behind a button
// (req:wf2.ui.related-collapsed): the search panel is not mounted, so no request goes out, until it is shown.
function Related({ open, setOpen, sub }: { open: boolean; setOpen: (v: boolean) => void; sub?: boolean }) {
  return (
    <>
      <div className={`peek-bar ${sub ? 'peek-sub' : ''} related-bar`}><strong>Related</strong><span className="muted">knowledge close to what you are writing</span><button className="linkish related-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'hide' : 'show'}</button></div>
      {open && <ContextPanel />}
    </>
  );
}

// The node's content (req:wf2.ui.node-content): the blocks under its defining line in the document's own editor,
// scoped to the node (decision:wf2.content-editor-scoped) — loaded from the content route with the document's
// hash, refetched on every graph change (the editor ignores a refetch while a save of its own is pending).
function NodeContent({ id }: { id: string }) {
  const { product } = usePeek();
  const [c, setC] = useState<{ text: string; content: string; bodyHash: string; project: string; doc: string; children: string[] } | null | 'none'>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{ kinds: string[] }>).detail.kinds.includes('graph')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, []);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/node/${encodeURIComponent(id)}/content`).then(r => r.ok ? r.json() : null).then(j => { if (live) setC(j ?? 'none'); }).catch(() => { if (live) setC('none'); });
    return () => { live = false; };
  }, [id, product, version]);
  if (c === 'none' || !c) return null;
  // the node's text is the first block, its content follows (decision:wf2.text-is-first-block)
  const body = c.text.trim() ? c.text.trim() + (c.content.trim() ? '\n\n' + c.content : '\n') : c.content;
  return (
    <section className="content">
      <h4>Content{c.children.length > 0 && <span className="muted">{c.children.length} block{c.children.length === 1 ? '' : 's'}</span>}{id.startsWith('question:') && <span className="muted" title="a question's content is its answer; a decision block under it resolves it">— the answer</span>}</h4>
      <div className="content-editor"><DocEditor key={id} product={product} project={c.project} slug={c.doc} body={body} ifMatch={c.bodyHash} scope={id} /></div>
    </section>
  );
}

// The comments on a node have their own section; the `on` edges from comment: nodes stay out of Links and Properties.
const withoutComments = (inc: [string, string[]][]): [string, string[]][] => inc.map(([v, ids]) => [v, v === 'on' ? ids.filter(x => !x.startsWith('comment:')) : ids] as [string, string[]]).filter(([, ids]) => ids.length);

// Titles come from the graph as raw markdown; the list shows them plain.
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// What the row lists share: the index, which ids are opened as cards, and how to open or close some.
type Rows = { index: Record<string, IndexEntry>; opened: Set<string>; toggle: (ids: string[], on?: boolean) => void };

// One connected node (rule:connected-cards): the expand toggle (only for a defined node — a stub has no card), the
// tag, the status and the title; opened, the node's embedded card follows — the same card its document shows.
function RelRow({ id, rows, extra, className }: { id: string; rows: Rows; extra?: React.ReactNode; className?: string }) {
  const e = rows.index[id]; const can = e?.defined === true; const on = can && rows.opened.has(id);
  return (
    <li className={`${className ?? ''} ${on ? 'open' : ''}`.trim()}>
      {can ? <button className="rel-x" onClick={() => rows.toggle([id])} aria-expanded={on} title={on ? 'Hide the card' : 'Show as a card'}>{on ? '▾' : '▸'}</button> : <span className="rel-x none" />}
      <SmartTag id={id} />{e?.status && <StatusPill status={e.status} />}{extra}<span className="rt">{e?.title && e.title !== id ? plain(e.title) : ''}</span>
      {on && <EmbeddedCard id={id} className="rel-card" />}
    </li>
  );
}

// A group heading: its label, count, and the cards / tags toggle that opens or closes every defined row at once.
// One group of links (Part of, Depends on, …): collapsed by default — the label and the count — and its rows on a click.
function RelGroup({ label, ids, rows }: { label: string; ids: string[]; rows: Rows }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`rel-group ${open ? 'open' : ''}`}>
      <RelHead label={<button className="rel-fold" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? '▾' : '▸'} {label}</button>} ids={ids} rows={rows} />
      {open && <ul>{ids.map(id => <RelRow key={id} id={id} rows={rows} />)}</ul>}
    </section>
  );
}
function RelHead({ label, ids, rows, count }: { label: React.ReactNode; ids: string[]; rows: Rows; count?: React.ReactNode }) {
  const can = ids.filter(id => rows.index[id]?.defined === true);
  const all = can.length > 0 && can.every(id => rows.opened.has(id));
  return <h5>{label} <span className="muted">{count ?? ids.length}</span>{can.length > 0 && <button className="rel-all" onClick={() => rows.toggle(can, !all)} title={all ? 'Show these as tags' : 'Show these as cards'}>{all ? 'tags' : 'cards'}</button>}</h5>;
}

// Every node connected to the open one, grouped by how it is connected, each row with its title and status.
function Relations({ out, inc, rows, inverses = {} }: { out: [string, string[]][]; inc: [string, string[]][]; rows: Rows; inverses?: Record<string, string> }) {
  // generated 'mentions' edges (a node's text naming a field) are noise next to real relations; an incoming edge
  // reads by its inverse name (the ontology's, else the built-in label)
  const words = (v: string) => v.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
  // a node's own content (has) is listed as its children, not as links
  const groups = [...out.filter(([v]) => v !== 'mentions' && v !== 'has').map(([v, ids]) => ({ key: 'o' + v, label: OUT[v] ?? words(v), ids })), ...inc.filter(([v]) => v !== 'mentions').map(([v, ids]) => ({ key: 'i' + v, label: INC[v] ?? (inverses[v] ? words(inverses[v]) : `${words(v)} · from`), ids }))];
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const rank = (id: string) => { const k = KIND_ORDER.indexOf(id.split(':')[0]); return k < 0 ? 99 : k; };
  if (!total) return <p className="muted rels-empty">Nothing links to or from this node yet.</p>;
  return (
    <div className="rels">
      {groups.map(g => <RelGroup key={g.key} label={g.label} ids={[...g.ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))} rows={rows} />)}
    </div>
  );
}

// A typed node's properties: every effective property of its type (own and inherited), filled or as a placeholder
// with its value type, then the inverses — incoming links named from this side (memberOf: team:platform).
function Properties({ type, props, inc, inverses, product, folded = false }: { type: TypeDef; props: NodeProp[]; inc: [string, string[]][]; inverses: Record<string, string>; product: string; folded?: boolean }) {
  const shown = props.filter(p => (p.from !== 'type:node' && !['title', 'status', 'text'].includes(p.name)) || (p.value && !['title', 'status', 'text'].includes(p.name)));
  const back = inc.filter(([v]) => inverses[v]).map(([v, ids]) => ({ name: inverses[v], ids }));
  const ids = (v: string) => v.replace(/^\[|\]$/g, '').split(/,\s*/).map(x => x.trim()).filter(Boolean);
  const [open, setOpen] = useState(!folded);
  const backCount = back.reduce((a, b) => a + b.ids.length, 0);
  if (folded && !open) return <section className="props folded"><h4><button className="linkish" onClick={() => setOpen(true)}>▸ Linked from <span className="muted">{backCount}</span></button></h4></section>;
  return (
    <section className="props">
      <h4>{folded ? <button className="linkish" onClick={() => setOpen(false)}>▾ Linked from <span className="muted">{backCount}</span></button> : shown.length ? 'Properties' : 'Linked from'}</h4>
      <dl className="strip">
        {shown.map(p => (
          <div key={p.name} className={p.value ? '' : 'empty'}>
            <dt title={p.from === type.id ? `declared on ${type.id}` : `inherited from ${p.from}`}>{p.name}{p.from !== type.id && <small> {p.from.slice(5)}</small>}</dt>
            <dd>{p.value ? (p.ref ? <span className="list">{ids(p.value).map(x => <span key={x} className="item">{/^[a-z][a-z0-9-]*:/.test(x) ? <SmartTag id={x} /> : x}</span>)}</span> : p.value) : <span className="muted">{p.ref ? `${p.many ? 'list of' : 'ref'} ${p.ref}` : p.type}{p.required ? ' · required' : ''}</span>}</dd>
          </div>))}
        {back.length > 0 && <div className="divider"><dt /><dd /></div>}
        {back.map(b => <div key={b.name} className="inverse"><dt title="inverse: not written here, derived from the other side">{b.name.replace(/-/g, ' ')}</dt><dd><span className="list">{b.ids.map(id => <span key={id} className="item"><SmartTag id={id} /></span>)}</span></dd></div>)}
      </dl>
    </section>
  );
}

// What serves a goal, as the kind's data table under its content (the rows part of the goal) — requirements, then
// tasks — filter, group and tick as on the kind's page; the tracking section keeps sub-goals.
function PartsTable({ id, kind, label, ids }: { id: string; kind: string; label: string; ids: string[] }) {
  const { product } = usePeek();
  const [table, setTable] = useState<Table | null>(null);
  useEffect(() => {
    let live = true;
    if (!ids.length) { setTable(null); return; }
    fetch(`/api/${product}/view/${kind}`).then(r => r.ok ? r.json() : null).then((t: Table | null) => { if (live && t) { const rows = t.rows.filter(r => ids.includes(r.id)); const count = new Map<string, number>(); for (const r of rows) if (r.status) count.set(r.status, (count.get(r.status) ?? 0) + 1); setTable({ ...t, rows, statuses: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) }); } }).catch(() => {});
    return () => { live = false; };
  }, [product, id, kind, ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ids.length || !table) return null;
  const done = table.rows.filter(r => ['done', 'complete', 'shipped'].includes(r.status)).length;
  return (
    <section className="goal-tasks">
      <h4>{label} <span className="muted">{done}/{table.rows.length}</span></h4>
      <InstanceTable product={product} table={table} initial={{ ...EMPTY_FILTERS, group: 'status' }} />
    </section>
  );
}

// Goal / task tracking: status, target, owner, progress and what contributes to it.
function Tracking({ entry, rows, inc }: { entry: IndexEntry; rows: Rows; inc: [string, string[]][] }) {
  const parts = (inc.find(([v]) => v === 'part-of')?.[1] ?? []).map(id => rows.index[id]).filter(Boolean);
  const byKind = (k: string) => parts.filter(p => p.kind === k);
  const done = (p: IndexEntry) => ['done', 'complete', 'shipped'].includes(p.status) || (p.progress ?? 0) >= 100;
  return (
    <section className="tracking">
      {entry.kind === 'goal' && (['goal'] as const).map(k => {
        const items = byKind(k); if (!items.length) return null;
        const label = 'Sub-goals';
        return (
          <div key={k} className="tracking-parts">
            <RelHead label={label} ids={items.map(p => p.id)} rows={rows} count={`${items.filter(done).length}/${items.length}`} />
            <ul>{items.map(p => <RelRow key={p.id} id={p.id} rows={rows} className={done(p) ? 'done' : ''} extra={p.progress !== undefined && k === 'goal' ? <span className="tpct">{p.progress}%</span> : undefined} />)}</ul>
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
