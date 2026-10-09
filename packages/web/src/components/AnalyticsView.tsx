'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SqlBox } from './LiveTable';
import { oneLine } from '@/lib/table-sql';
import { BUCKETS, TIME_FIELDS, analyticsQueryString, analyticsSql, cellKey, daysBetween, dimString, isDay, isSpan, isTimeDim, parseAnalyticsQuery, ticksFor, type Analytics, type AnalyticsQuery, type Bucket, type Dim, type Item, type Leaf } from '@/lib/analytics';

// The analytics page (component:analytics-view, decision:waterfall.analytics-view-replaces-timeline): a strip that
// edits the page's query, two wells — the rows and the columns, each a list of dimensions outer first, dragged to
// reorder or across — and the grid under them. The data is a query over the graph, as a table's is
// (decision:wf2.table-is-sql): the strip's switches write the SQL shown under it, and edited by hand it is the page's
// own. Every cell is the cards at that intersection — one line each, a status stripe at the left — and on a span
// column the cards are bars on a track, the old timeline. Clicking a card selects the node in the Context panel, the
// way a click on a block does (rule:block-select); its fields are edited on its card there.
interface Props { product: string; project: string; slug: string; query: string; legacy: boolean; analytics: Analytics; kinds: string[]; facets: { name: string; values: string[] }[]; /** the SQL that chose the cards, and why it chose none */ sql: string; sqlError: string }

const QUICK_DIMS = ['worker', 'owner', 'status', 'kind', 'part-of', 'worker.part-of'];
const MIN_BAR = 0.8;   // a one-day bar is still visible, in percent of the window
const LANE = 24;       // the height of one lane of bars on a track
const SEP = '\u0001';
type Axis = 'x' | 'y';
const name = (d: Dim) => (d.key === 'worker.part-of' ? 'team' : d.key);

export function AnalyticsView({ product, project, slug, query, legacy, analytics, kinds, facets, sql, sqlError }: Props) {
  const router = useRouter();
  const { select, setShowContext, index } = usePeek();
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<{ name: string; value: string } | null>(null);   // the filter being written
  const [picking, setPicking] = useState<Axis | null>(null);                             // the well whose Add menu is open
  const [showSql, setShowSql] = useState(false);
  // ask an agent what the page should show (decision:waterfall.analytics-from-words): the words → a query line the
  // server has checked once → the page's own line
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState(''); const [busy, setBusy] = useState(false); const [askMsg, setAskMsg] = useState('');
  const askAgent = async () => {
    if (!ask.trim() || busy) return; setBusy(true); setAskMsg('');
    try {
      const r = await fetch(`/api/${product}/analytics/write`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask, query }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.query) { setAskMsg(`${j.cards} card${j.cards === 1 ? '' : 's'} · ${j.query}`); setAsk(''); await write(parseAnalyticsQuery(j.query)); }
      else setAskMsg(j.message ?? 'the agent could not write the page');
    } catch (e) { setAskMsg(String(e)); } finally { setBusy(false); }
  };
  const q = useMemo(() => parseAnalyticsQuery(query, { legacyTrack: legacy }), [query, legacy]);

  // the query lives in the page's front matter, so changing it is an ordinary document write
  const write = useCallback(async (next: AnalyticsQuery) => {
    setSaving(true);
    await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { query: analyticsQueryString(next) } }) });
    setSaving(false);
    router.refresh();
  }, [product, project, slug, router]);
  const set = (patch: Partial<AnalyticsQuery>) => void write({ ...q, ...patch });
  // a filter is one property (or path) and a value: `quarter=q3`, `worker=ana,bo`, `worker.part-of=Till`
  const setFilter = (name: string, value: string) => {
    const props = { ...q.props };
    if (value.trim()) props[name.trim()] = value.trim(); else delete props[name.trim()];
    set({ props });
  };
  const values = (name: string) => facets.find(f => f.name === name)?.values ?? [];
  const custom = !!q.sql;
  const generated = useMemo(() => analyticsSql(q), [q]);
  const used = new Set([...q.x, ...q.y].map(d => d.key));
  // a dimension joins a well at the end — before the track, which stays last
  const addDim = (axis: Axis, d: Dim) => { const dims = q[axis]; set({ [axis]: [...dims.filter(x => !isSpan(x)), d, ...dims.filter(isSpan)] }); setPicking(null); };
  const setTrack = () => { set({ x: [...q.x.filter(x => !isTimeDim(x)), { key: 'when', bucket: 'span' }] }); setPicking(null); };
  // a drag moves a dimension within its well or into the other; it lands before the field it is dropped on, or last
  const drag = useRef<{ axis: Axis; i: number } | null>(null);
  const [over, setOver] = useState<{ axis: Axis; i: number } | null>(null);   // i = -1: the well itself
  const drop = (axis: Axis, i: number) => {
    const from = drag.current; drag.current = null; setOver(null);
    if (!from) return;
    const d = q[from.axis][from.i]; if (!d) return;
    if (isSpan(d) && axis === 'y') return;   // a track is a column
    const src = q[from.axis].filter((_, j) => j !== from.i);
    const dst = from.axis === axis ? src : [...q[axis]];
    const track = dst.filter(isSpan), rest = dst.filter(x => !isSpan(x));
    let at = i < 0 ? rest.length : Math.min(i - (from.axis === axis && from.i < i ? 1 : 0), rest.length);
    if (at < 0) at = 0;
    const next = isSpan(d) ? [...rest, d] : [...rest.slice(0, at), d, ...rest.slice(at), ...track];
    set(from.axis === axis ? { [axis]: next } : { [from.axis]: src, [axis]: next });
  };

  const open = (id: string) => { setShowContext(true); select(id); };
  const { from, to } = analytics;
  const span = analytics.span && isDay(from) && isDay(to) ? Math.max(1, daysBetween(from, to)) : 0;
  const at = (d: string) => (span ? Math.max(0, Math.min(100, (daysBetween(from, d) / span) * 100)) : 0);
  const ticks = analytics.span ? ticksFor(from, to) : [];
  const today = new Date().toISOString().slice(0, 10);
  const now = span && today >= from && today <= to ? at(today) : null;

  const card = (i: Item) => (
    <button key={i.id} className={`an-card k-${i.kind} s-${i.status || 'none'}`} title={`${i.title}${i.meta ? ` · ${i.meta}` : ''}${i.status ? ` · ${i.status}` : ''}`} onClick={() => open(i.id)}>
      <span className="an-card-title">{i.title}</span>
      {i.meta && <span className="an-card-meta">{i.meta}</span>}
    </button>
  );
  const bar = (i: Item) => {
    if (!i.span) return null;
    const left = at(i.span.from);
    const width = Math.max(MIN_BAR, at(i.span.to) - left);
    const title = `${i.title} · ${i.span.from}${i.span.to !== i.span.from ? ` → ${i.span.to}` : ''}${i.meta ? ` · ${i.meta}` : ''}${i.status ? ` · ${i.status}` : ''}`;
    return (
      <button key={i.id} className={`an-bar k-${i.kind} ${i.span.point ? 'point' : ''} s-${i.status || 'none'}`} style={{ left: `${left}%`, width: i.span.point ? undefined : `${width}%`, top: 3 + i.lane * LANE }} title={title} onClick={() => open(i.id)}>
        <span className="an-bar-label">{i.title}</span>
      </button>
    );
  };
  const label = (s: Leaf['steps'][number]) => (s.id && index[s.id] ? <button className="linkish" onClick={() => open(s.id)}>{s.label}</button> : s.label);

  // the column headers: one row per level, a header merged across the run of columns that share its prefix
  const xdims = analytics.span ? q.x.slice(0, -1) : q.x;
  const xLevels = Math.max(1, xdims.length);
  const runs = (leaves: Leaf[], level: number) => {
    const out: { start: number; span: number; step: Leaf['steps'][number] }[] = [];
    for (let i = 0; i < leaves.length;) { const pre = leaves[i].steps.slice(0, level + 1).map(s => s.key).join(SEP); let j = i; while (j < leaves.length && leaves[j].steps.slice(0, level + 1).map(s => s.key).join(SEP) === pre) j++; out.push({ start: i, span: j - i, step: leaves[i].steps[level] }); i = j; }
    return out;
  };
  const colRuns = Array.from({ length: xLevels }, (_, l) => runs(analytics.cols, l));
  const yLevels = Math.max(1, q.y.length);
  const rowRuns = Array.from({ length: yLevels }, (_, l) => new Map(runs(analytics.rows, l).map(r => [r.start, r.span])));
  const rowCount = (r: Leaf) => analytics.cols.reduce((n, c) => n + (analytics.cells[cellKey(r, c)]?.items.length ?? 0), 0);
  const rowLanes = (r: Leaf) => analytics.cols.reduce((n, c) => Math.max(n, analytics.cells[cellKey(r, c)]?.lanes ?? 1), 1);

  // the second and third row-header columns stick beside the first: their offsets are the widths of the ones before
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ths = gridRef.current?.querySelector('tbody tr')?.querySelectorAll<HTMLElement>('th');
    if (!ths || !gridRef.current) return;
    let left = 0;
    ths.forEach((th, i) => { gridRef.current!.style.setProperty(`--an-l${i}`, `${left}px`); left += th.offsetWidth; });
  });

  const field = (axis: Axis, d: Dim, i: number) => {
    const dims = q[axis];
    return (
      <div key={dimString(d)} className={`an-field ${isTimeDim(d) ? 'time' : ''} ${drag.current?.axis === axis && drag.current.i === i ? 'dragging' : ''} ${over?.axis === axis && over.i === i ? 'before' : ''}`}
        draggable onDragStart={e => { drag.current = { axis, i }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dimString(d)); }}
        onDragEnd={() => { drag.current = null; setOver(null); }}
        onDragOver={e => { if (!drag.current) return; e.preventDefault(); e.stopPropagation(); if (over?.axis !== axis || over.i !== i) setOver({ axis, i }); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(axis, i); }}>
        <span className="an-field-grip" aria-hidden>⋮⋮</span>
        <span className="an-field-n">{i + 1}</span>
        <span className="an-field-name" title={TIME_FIELDS[d.key] ?? d.key}>{name(d)}</span>
        {isTimeDim(d) && (
          <select className="an-field-bucket" value={d.bucket ?? 'month'} title={`${TIME_FIELDS[d.key]} — bucketed by`} onChange={e => {
            const bucket = e.target.value as Bucket;
            if (bucket === 'span') { set({ [axis]: [...dims.filter((_, j) => j !== i), { key: d.key, bucket }] }); return; }
            set({ [axis]: dims.map((x, j) => (j === i ? { key: x.key, bucket } : x)) });
          }}>
            {BUCKETS.filter(b => b !== 'span' || axis === 'x').map(b => <option key={b} value={b}>{b === 'span' ? 'span · a track' : b}</option>)}
          </select>
        )}
        <button className="an-ib x" title="Remove this dimension" onClick={() => set({ [axis]: dims.filter((_, j) => j !== i) })}>×</button>
      </div>
    );
  };
  const well = (axis: Axis) => (
    <div className={`an-well ${over?.axis === axis && over.i < 0 ? 'over' : ''}`}
      onDragOver={e => { if (!drag.current) return; e.preventDefault(); if (over?.axis !== axis || over.i !== -1) setOver({ axis, i: -1 }); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
      onDrop={e => { e.preventDefault(); drop(axis, -1); }}>
      <h2>{axis === 'y' ? 'Rows' : 'Columns'} <span className="muted">· outer first</span>
      <span className="an-picker an-add">
        <button className="an-chip ghost" onClick={() => setPicking(picking === axis ? null : axis)} title="Add a dimension — a property, a team, a status, a month">+ dimension</button>
        {picking === axis && (
          <div className="an-menu" onMouseLeave={() => setPicking(null)}>
            <div className="an-menu-h">group by</div>
            {[...new Set([...QUICK_DIMS, ...facets.map(f => f.name)])].filter(k => !used.has(k)).map(k => (
              <button key={k} onClick={() => addDim(axis, { key: k })}><span>{name({ key: k })}</span><span className="an-menu-how">{k === 'worker.part-of' ? 'worker.part-of' : k === 'kind' || k === 'status' ? k : 'property'}</span></button>
            ))}
            <input className="an-path" placeholder="a path: worker.part-of" title="A property, or a path of links — worker.part-of is the team of the worker"
              onKeyDown={e => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) addDim(axis, { key: v }); if (e.key === 'Escape') setPicking(null); }} />
            <div className="an-menu-h">time · a date field, bucketed</div>
            {Object.entries(TIME_FIELDS).filter(([k]) => !used.has(k)).map(([k, how]) => (
              <button key={k} onClick={() => addDim(axis, { key: k, bucket: 'month' })}><span>{k}</span><span className="an-menu-how">{how}</span></button>
            ))}
            {axis === 'x' && !q.x.some(isSpan) && <button onClick={setTrack}><span>when · a track</span><span className="an-menu-how">the Gantt, last level</span></button>}
          </div>
        )}
      </span>
      </h2>
      <div className="an-fields">
        {q[axis].map((d, i) => field(axis, d, i))}
        {!q[axis].length && <div className="an-empty-well">{axis === 'y' ? 'one row of everything — drop a dimension here' : 'one column of all — drop a dimension here'}</div>}
      </div>
    </div>
  );

  return (
    <section className="anwrap">
      <div className="anbar">
        <MultiSelect label="kinds" all="all kinds" options={kinds} value={q.kinds} onChange={v => set({ kinds: v })} disabled={custom} />
        <span className="an-group">
          <span className="muted small">where</span>
          {Object.entries(q.props).map(([k, v]) => (
            <span key={k} className="an-filter">
              <b>{k}</b>
              <input list={`anv-${k}`} defaultValue={v} disabled={custom} onBlur={e => { if (e.target.value.trim() !== v) setFilter(k, e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <datalist id={`anv-${k}`}>{values(k).map(x => <option key={x} value={x} />)}</datalist>
              <button className="an-x" onClick={() => setFilter(k, '')} title={`Drop ${k}`}>×</button>
            </span>
          ))}
          {adding
            ? <span className="an-filter adding">
                <input autoFocus list="an-props" placeholder="property" value={adding.name} onChange={e => setAdding({ ...adding, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') setAdding(null); if (e.key === 'Enter' && adding.name.trim()) (e.currentTarget.nextElementSibling?.nextElementSibling as HTMLInputElement | null)?.focus(); }} />
                <datalist id="an-props">{facets.map(f => <option key={f.name} value={f.name} />)}</datalist>
                <input list="anv-new" placeholder="is…" value={adding.value} onChange={e => setAdding({ ...adding, value: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') setAdding(null); if (e.key === 'Enter' && adding.name.trim() && adding.value.trim()) { setFilter(adding.name, adding.value); setAdding(null); } }} />
                <datalist id="anv-new">{values(adding.name).map(x => <option key={x} value={x} />)}</datalist>
                <button className="an-x" onClick={() => { if (adding.name.trim() && adding.value.trim()) setFilter(adding.name, adding.value); setAdding(null); }} title="Add this filter">✓</button>
              </span>
            : <button className="an-chip ghost" disabled={custom} onClick={() => setAdding({ name: '', value: '' })} title={custom ? 'This page runs its own SQL — the filters step aside' : 'Filter by a property — quarter=q3, worker=ana, worker.part-of=Till'}>+ filter</button>}
        </span>
        <input className="an-find" defaultValue={q.q} disabled={custom} placeholder="words…" onBlur={e => { if (e.target.value.trim() !== q.q) set({ q: e.target.value.trim() }); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <button className={`an-chip ask ${asking ? 'on' : ''}`} onClick={() => setAsking(a => !a)} title="Ask an agent what this page should show — it writes the whole line: the kinds, the filters, the rows and the columns">✦ Ask</button>
        <button className={`an-chip ${custom || showSql ? 'on' : ''}`} onClick={() => setShowSql(s => !s)} title={custom ? 'This page runs its own SQL' : 'The SQL the switches write — edit it to make the page your own'}>SQL{custom ? ' · own' : ''} {showSql ? '▴' : '▾'}</button>
        {analytics.span && (
          <span className="an-group">
            <span className="muted small">from</span>
            <input className="an-date" type="date" value={q.from} onChange={e => set({ from: e.target.value })} />
            <span className="muted small">to</span>
            <input className="an-date" type="date" value={q.to} onChange={e => set({ to: e.target.value })} />
            {(q.from || q.to) && <button className="an-chip" onClick={() => set({ from: '', to: '' })} title="Fit the window to what is on the track">fit</button>}
          </span>
        )}
        <span className="an-count muted small">{analytics.total} on the page{analytics.undated ? ` · ${analytics.undated} with no dates` : ''}{saving ? ' · saving…' : ''}</span>
      </div>
      {asking && (
        <div className="sql-ask an-ask">
          <span className="sql-ask-mark" aria-hidden>✦</span>
          <input autoFocus value={ask} disabled={busy} spellCheck={false} placeholder="What should this page show? e.g. tasks by team per month · a board of what is blocked, by worker · a timeline of this quarter's goals"
            onChange={e => setAsk(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void askAgent(); } if (e.key === 'Escape') setAsking(false); }} />
          <button type="button" onClick={() => void askAgent()} disabled={busy || !ask.trim()}>{busy ? 'writing…' : 'Write the page'}</button>
          {askMsg && <span className="an-ask-msg muted small">{askMsg}</span>}
        </div>
      )}
      {(showSql || sqlError) && (
        <SqlBox sql={custom ? q.sql! : sql || generated} custom={custom} ctx={{ product, kind: q.kinds[0] ?? 'node' }}
          onRun={s => set({ sql: s && oneLine(s) !== oneLine(generated) ? oneLine(s) : undefined })} />
      )}
      {sqlError && <p className="notice an-sql-error">{sqlError}</p>}
      <div className="an-axes">
        {well('y')}
        {well('x')}
      </div>

      {!analytics.total ? (
        <p className="an-empty muted">
          {sqlError ? <>The query drew nothing — see what it said above.</>
            : analytics.span
            ? <>Nothing on this track yet. A node joins it by saying when it happens — <code>starts</code> and <code>ends</code>, a <code>duration</code>, or a <code>due</code> date — and the strip above chooses which nodes it watches.</>
            : <>Nothing admitted by this query. The strip above chooses the kinds and the filters; the rows and the columns say how what is admitted is grouped.</>}
        </p>
      ) : (
        <div className="angrid" ref={gridRef}>
          <table className="an-table">
            <thead>
              {colRuns.map((rs, l) => (
                <tr key={l}>
                  {l === 0 && (
                    <th className="an-corner" rowSpan={xLevels + (analytics.span ? 1 : 0)} colSpan={yLevels}>
                      <div className="an-ax">{q.y.map(name).join(' ▸ ') || 'everything'}</div>
                      <div className="an-ax muted">↓ rows · columns → {[...xdims.map(name), ...(analytics.span ? ['when'] : [])].join(' ▸ ') || 'all'}</div>
                    </th>
                  )}
                  {rs.map(r => <th key={r.start} colSpan={r.span} className={`${l === 0 ? 'lvl0' : ''} ${xdims[l] && isTimeDim(xdims[l]) ? 'time' : ''}`}>{label(r.step)}</th>)}
                </tr>
              ))}
              {analytics.span && (
                <tr>
                  {analytics.cols.map(c => (
                    <th key={c.key} className="an-ticks-th">
                      <div className="an-ticks">
                        {ticks.map(t => <span key={t.at} className={`an-tick ${t.major ? 'major' : ''} ${at(t.at) < 2 ? 'first' : ''}`} style={{ left: `${at(t.at)}%` }}>{t.label}</span>)}
                        {now !== null && <span className="an-now" style={{ left: `${now}%` }} title={`today · ${today}`} />}
                      </div>
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {analytics.rows.map((r, i) => (
                <tr key={r.key}>
                  {r.steps.map((s, l) => {
                    const run = rowRuns[l].get(i);
                    if (run === undefined) return null;   // this level's header is still the one above
                    return (
                      <th key={l} rowSpan={run} className={`an-rh l${l} ${l === 0 && yLevels > 1 ? 'lvl0' : ''}`}>
                        {label(s)}
                        {l === yLevels - 1 && <span className="an-rowcount muted">{rowCount(r)}</span>}
                      </th>
                    );
                  })}
                  {analytics.cols.map(c => {
                    const cell = analytics.cells[cellKey(r, c)];
                    if (analytics.span) return (
                      <td key={c.key} className="an-track-td">
                        <div className="an-track" style={{ minHeight: rowLanes(r) * LANE + 6 }}>
                          {ticks.map(t => <i key={t.at} className={`an-grid ${t.major ? 'major' : ''}`} style={{ left: `${at(t.at)}%` }} />)}
                          {now !== null && <span className="an-now" style={{ left: `${now}%` }} />}
                          {cell?.items.map(bar)}
                        </div>
                      </td>
                    );
                    return <td key={c.key} className={`an-cell ${cell ? '' : 'empty'}`}>{cell && <div className="an-stack">{cell.items.map(card)}</div>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="an-legend muted small">
            {analytics.span ? <span>window {from} → {to} · ▎ today</span> : null}
            <span>{analytics.rows.length} rows × {analytics.cols.length} columns</span>
          </div>
        </div>
      )}
    </section>
  );
}

// One chip that says what is picked, a checklist under it: the kinds a page draws (none picked is every kind).
function MultiSelect({ label, all, options, value, onChange, disabled }: { label: string; all: string; options: string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  // the list closes on a click outside it (the App Router's root is document: check the target)
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const shown = options.filter(o => !find || o.includes(find.toLowerCase()));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...options.filter(x => value.includes(x) || x === o)]);
  return (
    <span className="an-ms" ref={ref}>
      <button className={`an-chip ${value.length ? 'on' : ''}`} disabled={disabled} onClick={() => setOpen(o => !o)} title={disabled ? 'This page runs its own SQL — the switches step aside' : 'The kinds this page draws'}>
        {label} · {value.length ? value.join(', ') : all} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="an-ms-menu">
          <input type="search" autoFocus placeholder="find a kind…" value={find} onChange={e => setFind(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && shown.length === 1) toggle(shown[0]); }} />
          {shown.map(o => (
            <label key={o}><input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />{o}</label>
          ))}
          {!shown.length && <span className="muted small" style={{ padding: '4px 8px' }}>no kind matches</span>}
          <div className="an-ms-foot">
            {value.length > 0 && <button onClick={() => onChange([])}>every kind</button>}
            <button onClick={() => setOpen(false)}>done</button>
          </div>
        </div>
      )}
    </span>
  );
}
