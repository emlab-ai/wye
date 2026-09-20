'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { StatusPill } from './Pills';
import { requestSend } from './CommandBox';
import { filterWork, groupWork, workCounts, STATE_ORDER, type WorkItem, type WorkGroupBy, type WorkFilter, type WorkState } from '@/lib/work';
import { TASK_STATUSES } from '@/lib/props';
import { Assign } from './Assign';

const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
const GROUPS: { key: WorkGroupBy; label: string }[] = [{ key: 'status', label: 'status' }, { key: 'state', label: 'state' }, { key: 'goal', label: 'goal' }, { key: 'pr', label: 'request' }, { key: 'document', label: 'document' }, { key: 'worker', label: 'worker' }];
const STATE_LABEL: Record<WorkState, string> = { queued: 'queued', working: 'working', stalled: 'stalled', held: 'held', unassigned: 'unassigned', done: '' };

// The person's name for "mine" (req:exec.human-work): the app has no accounts (gate:none), so it is remembered per browser.
export function useMe(): [string, (v: string) => void] {
  const [me, setMe] = useState('');
  useEffect(() => { try { setMe(localStorage.getItem('wf-me') ?? ''); } catch { /* ignore */ } }, []);
  return [me, v => { setMe(v); try { localStorage.setItem('wf-me', v); } catch { /* ignore */ } }];
}

// The Work view (req:exec.work-view): every task of the product, its status (the line's word) and state (what is
// happening now), worker, plan, goal, sessions; grouped by status by default; filters and search in the URL
// (?q= &status= &state= &worker= &goal= &plan= &doc= &done=1 &group= &mine=1); done folded away unless asked.
export function WorkList({ product, items, people }: { product: string; items: WorkItem[]; people: string[] }) {
  const { open, openId } = usePeek();
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const [me, setMe] = useMe();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<WorkItem | null>(null);
  const [building, setBuilding] = useState<string | null>(null); // the plan ref when the row's Build was pressed (req:exec.build-from-definition)
  const f: WorkFilter = { q: sp.get('q') ?? '', status: sp.get('status') ?? '', state: sp.get('state') ?? '', worker: sp.get('worker') ?? '', goal: sp.get('goal') ?? '', pr: sp.get('plan') ?? '', doc: sp.get('doc') ?? '', done: sp.get('done') === '1', mine: sp.get('mine') === '1' ? (me || '—') : '' };
  const group = (sp.get('group') as WorkGroupBy | null) ?? 'status';
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '' || v === undefined) n.delete(k); else n.set(k, v); }
    router.replace(`${path}${n.toString() ? `?${n}` : ''}`, { scroll: false });
  };
  const visible = useMemo(() => filterWork(items, f), [items, f.q, f.status, f.state, f.worker, f.goal, f.pr, f.doc, f.done, f.mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => workCounts(filterWork(items, { done: true })), [items]);
  const groups = useMemo(() => group === 'status' && !f.q && !f.status ? groupWork(visible, 'status') : groupWork(visible, group), [visible, group, f.q, f.status]);
  const toggle = (id: string) => setCollapsed(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const label = (k: string) => k.startsWith('—') ? k : group === 'goal' || group === 'pr' ? k.replace(/^(goal|plan):/, '') : k;
  const Row = ({ r, depth }: { r: WorkItem; depth: number }) => (
    <>
      <div className={`trow wrow ${r.id === openId ? 'on' : ''} ${r.status === 'done' ? 'done' : ''} st-${r.state}`} style={{ '--depth': depth } as React.CSSProperties} onClick={() => open(r.id)} role="row" data-task={r.id}>
        <div className="tcell tname">
          {r.children.length ? <button className="tchev" onClick={e => { e.stopPropagation(); toggle(r.id); }} title={collapsed.has(r.id) ? 'Expand' : 'Collapse'}>{collapsed.has(r.id) ? '▸' : '▾'}</button> : <span className="tchev" />}
          <i className="tdot k-task" style={{ background: 'var(--k-task, var(--k-other))' }} />
          <span className="ttitle" title={plain(r.title)}>{plain(r.title) || r.id}</span>
          {r.ready && <span className="pill ready" title="marked ready: a runner may take it">ready</span>}
          {r.blocked && <span className="pill blocked-by" title={`blocked by ${r.blockedBy.join(', ')}`}>⛔</span>}
          {r.requestTask && r.definition && <span className={`pill s ${r.definition.defined ? 'done' : 'in-progress'}`} title={`the plan's Definition: ${r.definition.total} blocks, ${r.definition.agreed} agreed, ${r.definition.open} open${r.definition.contradicted ? `, ${r.definition.contradicted} contradicted` : ''}`}>{r.definition.defined ? 'defined' : `${r.definition.agreed}/${r.definition.total} agreed`}</span>}
          <code className="tid">{r.requestTask ? 'request' : r.id.replace(/^task:/, '')}</code>
        </div>
        <div className="tcell"><StatusPill status={r.status} /></div>
        <div className="tcell tstate">{r.state !== 'done' && <span className={`wstate ${r.state}`} data-worker={r.worker ?? ''} title={r.sessions.length ? `${r.sessions.length} session(s)` : ''}>{STATE_LABEL[r.state]}</span>}</div>
        <div className="tcell tgoal">{r.pr && !r.requestTask ? <button className="tparent" onClick={e => { e.stopPropagation(); open(r.pr!.id); }} title={r.pr.id}>{plain(r.pr.title)}</button> : r.partOf[0] ? <button className="tparent" onClick={e => { e.stopPropagation(); open(r.partOf[0]); }} title={r.partOf[0]}>{r.partOf[0].replace(/^[a-z-]+:/, '')}</button> : null}</div>
        <div className="tcell towner">{r.worker ?? <span className="muted">—</span>}</div>
        <div className="tcell tdoc">
          {r.doc && <a href={`/${product}/${r.doc.project}/d/${r.doc.slug}#n-${encodeURIComponent(r.id)}`} onClick={e => e.stopPropagation()} title="Open the document where it is defined">{r.doc.slug}</a>}
          {r.requestTask && r.pr && r.doc && r.state !== 'working' && r.state !== 'queued' && <button className="tsend" title="Assign the request with the plan's Definition as context" onClick={e => { e.stopPropagation(); setBuilding(`${product}/${r.doc!.project}/${r.doc!.slug}`); setAssigning(r); }} disabled={r.status === 'done'}>build</button>}
          <button className="tsend" title="Assign to a worker" onClick={e => { e.stopPropagation(); setBuilding(null); setAssigning(r); }} disabled={r.status === 'done'}>assign</button>
          <button className="tsend" title="Send to agent" onClick={e => { e.stopPropagation(); requestSend({ refs: [r.id], text: plain(r.title), source: r.doc ? { project: r.doc.project, doc: r.doc.slug, link: `${location.origin}/${product}/${r.doc.project}/d/${r.doc.slug}#n-${encodeURIComponent(r.id)}` } : undefined }); }}>⇢</button>
        </div>
      </div>
      {!collapsed.has(r.id) && r.children.map(c => <Row key={c.id} r={c} depth={depth + 1} />)}
    </>
  );
  return (
    <div className="track work">
      <div className="track-tools">
        <div className="work-tools-row">
          <input type="search" placeholder="Search work…" value={f.q} onChange={e => set({ q: e.target.value })} />
          <label className="work-me" title="Your name, for “mine” and for ticking work done"><span className="muted">I am</span><input value={me} placeholder={people[0] ?? 'name'} onChange={e => setMe(e.target.value)} list="work-people" /><datalist id="work-people">{people.map(p => <option key={p} value={p} />)}</datalist></label>
        </div>
        <div className="chips">
          <span className="chips-label">group by</span>
          {GROUPS.map(g => <button key={g.key} className={`chip ${group === g.key ? 'on' : ''}`} onClick={() => set({ group: g.key === 'status' ? null : g.key })}>{g.label}</button>)}
          <span className="chips-label" style={{ marginLeft: 12 }}>show</span>
          <button className={`chip ${sp.get('mine') === '1' ? 'on' : ''}`} onClick={() => set({ mine: sp.get('mine') === '1' ? null : '1' })} title={me ? `work held by ${me}` : 'set your name first'}>mine</button>
          <button className={`chip ${f.worker === '—' ? 'on' : ''}`} onClick={() => set({ worker: f.worker === '—' ? null : '—' })}>unassigned <small>{counts.state.unassigned ?? 0}</small></button>
          <button className={`chip ${f.done ? 'on' : ''}`} onClick={() => set({ done: f.done ? null : '1' })}>done work <small>{counts.status.done ?? 0}</small></button>
        </div>
        <div className="chips">
          <button className={`chip ${!f.status && !f.state ? 'on' : ''}`} onClick={() => set({ status: null, state: null })}>All <small>{counts.total - (f.done ? 0 : counts.status.done ?? 0)}</small></button>
          {TASK_STATUSES.filter(st => counts.status[st] && (st !== 'done' || f.done)).map(st => <button key={st} className={`chip s-${st} ${f.status === st ? 'on' : ''}`} onClick={() => set({ status: f.status === st ? null : st })}>{st} <small>{counts.status[st]}</small></button>)}
          <span className="chips-label" style={{ marginLeft: 12 }}>state</span>
          {STATE_ORDER.filter(st => st !== 'done' && counts.state[st]).map(st => <button key={st} className={`chip st-${st} ${f.state === st ? 'on' : ''}`} onClick={() => set({ state: f.state === st ? null : st })}>{st} <small>{counts.state[st]}</small></button>)}
        </div>
        {(f.goal || f.pr || f.doc) && <div className="chips"><span className="chips-label">in</span>{f.goal && <button className="chip on" onClick={() => set({ goal: null })}>{f.goal} ×</button>}{f.pr && <button className="chip on" onClick={() => set({ pr: null })}>{f.pr} ×</button>}{f.doc && <button className="chip on" onClick={() => set({ doc: null })}>{f.doc} ×</button>}</div>}
      </div>
      <div className="ttable" role="table">
        <div className="trow wrow thead" role="row"><div className="tcell tname">Work</div><div className="tcell">Status</div><div className="tcell tstate">State</div><div className="tcell tgoal">Plan / goal</div><div className="tcell towner">Worker</div><div className="tcell tdoc">Document</div></div>
        {groups.map(([k, rs]) => (
          <div key={k} className="tgroup">
            <div className="tgroup-head" onClick={() => toggle('g:' + k)}><span className="tchev">{collapsed.has('g:' + k) ? '▸' : '▾'}</span><span className="ttitle">{label(k)}</span>{(group === 'goal' || group === 'pr') && !k.startsWith('—') && <button className="linkish small" onClick={e => { e.stopPropagation(); open(k); }}>open</button>}<small className="muted">{rs.length}</small></div>
            {!collapsed.has('g:' + k) && rs.map(r => <Row key={r.id} r={r} depth={0} />)}
          </div>))}
        {!visible.length && <p className="muted" style={{ padding: 16 }}>No work matches.</p>}
      </div>
      {assigning && <Assign product={product} item={assigning} people={people} me={me} build={building ?? undefined} onClose={() => setAssigning(null)} onDone={s => { setAssigning(null); if (s) open(`session:${s}`); else router.refresh(); }} />}
    </div>
  );
}
