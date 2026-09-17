'use client';
import { useMemo, useState } from 'react';
import { usePeek } from './PeekProvider';
import { ProgressBar } from './Progress';
import { StatusPill } from './Pills';
import { docRoute } from '@/lib/doc';
import { GOAL_STATUSES, TASK_STATUSES } from '@/lib/props';
import { requestSend } from './CommandBox';

export type TrackRow = { id: string; title: string; status: string; target?: string; owner?: string; progress?: number; parts?: { done: number; total: number }; parent?: string; file: string; doc?: string; children: TrackRow[] };

const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
const DONE = new Set(['done', 'complete', 'shipped']);

// Goals or tasks as a tracking list: search, status filter, nested sub-items; a row opens the item in the right column.
export function TrackList({ product, kind, rows }: { product: string; kind: 'goal' | 'task'; rows: TrackRow[] }) {
  const { open, openId, index } = usePeek();
  const goalTitle = (id: string) => { const e = index[id]; return e && e.title !== id ? e.title : id.replace(/^goal:/, ''); };
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<'none' | 'doc' | 'goal' | 'status' | 'owner'>('none');
  const statuses = kind === 'goal' ? GOAL_STATUSES : TASK_STATUSES;
  const n = q.trim().toLowerCase();
  const matches = (r: TrackRow): boolean => (!n || r.id.toLowerCase().includes(n) || plain(r.title).toLowerCase().includes(n) || (r.owner ?? '').toLowerCase().includes(n)) && (!status || r.status === status || (status === 'off-track-or-blocked' && ['off-track', 'blocked', 'at-risk'].includes(r.status)));
  const visible = useMemo(() => {
    const keep = (r: TrackRow): TrackRow | null => { const kids = r.children.map(keep).filter(Boolean) as TrackRow[]; return matches(r) || kids.length ? { ...r, children: kids } : null; };
    return rows.map(keep).filter(Boolean) as TrackRow[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, n, status]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; const walk = (r: TrackRow) => { c[r.status || '—'] = (c[r.status || '—'] ?? 0) + 1; r.children.forEach(walk); }; rows.forEach(walk); return c; }, [rows]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const toggle = (id: string) => setCollapsed(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  // Grouping flattens the tree and buckets rows by document, goal, status or owner.
  const groups = useMemo(() => {
    if (groupBy === 'none') return null;
    const flat: TrackRow[] = []; const walk = (r: TrackRow) => { flat.push({ ...r, children: [] }); r.children.forEach(walk); }; visible.forEach(walk);
    const keyOf = (r: TrackRow) => groupBy === 'doc' ? (docRoute(r.file) ? `${docRoute(r.file)!.project} / ${docRoute(r.file)!.doc}` : r.file || '—') : groupBy === 'goal' ? (r.parent ?? '— no goal') : groupBy === 'status' ? (r.status || '— none') : (r.owner ?? '— unassigned');
    const m = new Map<string, TrackRow[]>();
    for (const r of flat) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m].sort((a, b) => a[0].startsWith('—') ? 1 : b[0].startsWith('—') ? -1 : a[0].localeCompare(b[0]));
  }, [visible, groupBy]);
  const Row = ({ r, depth }: { r: TrackRow; depth: number }) => {
    const route = docRoute(r.file);
    return (
      <>
        <div className={`trow ${r.id === openId ? 'on' : ''} ${DONE.has(r.status) ? 'done' : ''}`} style={{ '--depth': depth } as React.CSSProperties} onClick={() => open(r.id)} role="row">
          <div className="tcell tname">
            {r.children.length ? <button className="tchev" onClick={e => { e.stopPropagation(); toggle(r.id); }} title={collapsed.has(r.id) ? 'Expand' : 'Collapse'}>{collapsed.has(r.id) ? '▸' : '▾'}</button> : <span className="tchev" />}
            <i className={`tdot k-${kind}`} style={{ background: `var(--k-${kind}, var(--k-other))` }} />
            <span className="ttitle">{plain(r.title) || r.id}</span>
            <code className="tid">{r.id.replace(/^(goal|task):/, '')}</code>
          </div>
          <div className="tcell"><StatusPill status={r.status} /></div>
          <div className="tcell tdate">{r.target ?? ''}</div>
          {kind === 'goal'
            ? <div className="tcell tprog"><ProgressBar value={r.progress} width={80} /><span className="tpct">{r.progress !== undefined ? `${r.progress}%` : '—'}</span>{r.parts && <small className="muted" title="parts done / total">{r.parts.done}/{r.parts.total}</small>}</div>
            : <div className="tcell tgoal">{r.parent && <button className="tparent" onClick={e => { e.stopPropagation(); open(r.parent!); }} title={r.parent}>{plain(goalTitle(r.parent))}</button>}</div>}
          <div className="tcell towner">{r.owner ?? ''}</div>
          <div className="tcell tdoc">{route && <a href={`/${product}/${route.project}/d/${route.doc}#n-${encodeURIComponent(r.id)}`} onClick={e => e.stopPropagation()} title="Open the document where it is defined">{route.doc}</a>}
            <button className="tsend" title="Send to agent" onClick={e => { e.stopPropagation(); requestSend({ refs: [r.id], text: plain(r.title), source: route ? { project: route.project, doc: route.doc, link: `${location.origin}/${product}/${route.project}/d/${route.doc}#n-${encodeURIComponent(r.id)}` } : undefined }); }}>⇢</button></div>
        </div>
        {!collapsed.has(r.id) && r.children.map(c => <Row key={c.id} r={c} depth={depth + 1} />)}
      </>
    );
  };
  return (
    <div className="track">
      <div className="track-tools">
        <input type="search" placeholder={`Search ${kind}s…`} value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips">
          <span className="chips-label">group by</span>
          {(['none', 'doc', 'goal', 'status', 'owner'] as const).map(g => <button key={g} className={`chip ${groupBy === g ? 'on' : ''}`} onClick={() => setGroupBy(g)}>{g === 'doc' ? 'document' : g}</button>)}
        </div>
        <div className="chips">
          <button className={`chip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>All <small>{total}</small></button>
          {kind === 'goal' && <button className={`chip ${status === 'off-track-or-blocked' ? 'on' : ''}`} onClick={() => setStatus('off-track-or-blocked')}>Needs attention <small>{(counts['at-risk'] ?? 0) + (counts['off-track'] ?? 0)}</small></button>}
          {statuses.filter(st => counts[st]).map(st => <button key={st} className={`chip s-${st} ${status === st ? 'on' : ''}`} onClick={() => setStatus(status === st ? '' : st)}>{st} <small>{counts[st]}</small></button>)}
          {Object.keys(counts).filter(st => st !== '—' && !statuses.includes(st)).map(st => <button key={st} className={`chip ${status === st ? 'on' : ''}`} onClick={() => setStatus(status === st ? '' : st)}>{st} <small>{counts[st]}</small></button>)}
        </div>
      </div>
      <div className="ttable" role="table">
        <div className="trow thead" role="row"><div className="tcell tname">Name</div><div className="tcell">Status</div><div className="tcell tdate">{kind === 'goal' ? 'Target' : 'Due'}</div><div className="tcell tprog">{kind === 'goal' ? 'Progress' : 'Goal'}</div><div className="tcell towner">Owner</div><div className="tcell tdoc">Document</div></div>
        {groups
          ? groups.map(([label, rs]) => (
            <div key={label} className="tgroup">
              <div className="tgroup-head" onClick={() => toggle('g:' + label)}><span className="tchev">{collapsed.has('g:' + label) ? '▸' : '▾'}</span>{groupBy === 'goal' && !label.startsWith('—') ? <><span className="ttitle">{plain(goalTitle(label))}</span><code className="tid">{label.replace(/^goal:/, '')}</code></> : <span className="ttitle">{label}</span>}<small className="muted">{rs.length}</small></div>
              {!collapsed.has('g:' + label) && rs.map(r => <Row key={r.id} r={r} depth={0} />)}
            </div>))
          : visible.map(r => <Row key={r.id} r={r} depth={0} />)}
        {!visible.length && <p className="muted" style={{ padding: 16 }}>No {kind}s match.</p>}
      </div>
    </div>
  );
}
