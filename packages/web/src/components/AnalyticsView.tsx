'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { BUCKETS, TIME_FIELDS, analyticsQueryString, cellKey, daysBetween, dimString, isDay, isSpan, isTimeDim, parseAnalyticsQuery, ticksFor, type Analytics, type AnalyticsQuery, type Bucket, type Dim, type Item, type Leaf } from '@/lib/analytics';

// The analytics page (component:analytics-view, decision:waterfall.analytics-view-replaces-timeline): a strip that
// edits the page's query, the rows and the columns as stacks of dimensions, and the grid under them. Every cell is
// the cards at that intersection — one line each, a status stripe at the left — and on a span column the cards are
// bars on a track, the old timeline. Clicking a card selects the node in the Context panel, the way a click on a block
// does (rule:block-select); its fields are edited on its card there.
interface Props { product: string; project: string; slug: string; query: string; legacy: boolean; analytics: Analytics; kinds: string[]; facets: { name: string; values: string[] }[] }

const QUICK_DIMS = ['worker', 'owner', 'status', 'kind', 'part-of', 'worker.part-of'];
const MIN_BAR = 0.8;   // a one-day bar is still visible, in percent of the window
const LANE = 24;       // the height of one lane of bars on a track
const SEP = '\u0001';

export function AnalyticsView({ product, project, slug, query, legacy, analytics, kinds, facets }: Props) {
  const router = useRouter();
  const { select, setShowContext, index } = usePeek();
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<{ name: string; value: string } | null>(null);   // the filter being written
  const [picking, setPicking] = useState<'x' | 'y' | null>(null);                         // the axis whose level menu is open
  const q = useMemo(() => parseAnalyticsQuery(query, { legacyTrack: legacy }), [query, legacy]);

  // the query lives in the page's front matter, so changing it is an ordinary document write
  const write = useCallback(async (next: AnalyticsQuery) => {
    setSaving(true);
    await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { query: analyticsQueryString(next) } }) });
    setSaving(false);
    router.refresh();
  }, [product, project, slug, router]);
  const set = (patch: Partial<AnalyticsQuery>) => void write({ ...q, ...patch });
  const toggleKind = (k: string) => set({ kinds: q.kinds.includes(k) ? q.kinds.filter(x => x !== k) : [...q.kinds, k] });
  // a filter is one property (or path) and a value: `quarter=q3`, `worker=ana,bo`, `worker.part-of=Till`
  const setFilter = (name: string, value: string) => {
    const props = { ...q.props };
    if (value.trim()) props[name.trim()] = value.trim(); else delete props[name.trim()];
    set({ props });
  };
  const values = (name: string) => facets.find(f => f.name === name)?.values ?? [];
  const used = new Set([...q.x, ...q.y].map(d => d.key));
  // a level joins an axis at the end — before the track, which stays last
  const addLevel = (axis: 'x' | 'y', d: Dim) => { const dims = q[axis]; set({ [axis]: [...dims.filter(x => !isSpan(x)), d, ...dims.filter(isSpan)] }); setPicking(null); };
  const setTrack = () => set({ x: [...q.x.filter(x => !isTimeDim(x)), { key: 'when', bucket: 'span' }] });

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

  const levelChip = (axis: 'x' | 'y', d: Dim, i: number) => {
    const dims = q[axis]; const other = axis === 'x' ? 'y' : 'x';
    const swap = (j: number) => { const n = [...dims]; [n[i], n[j]] = [n[j], n[i]]; set({ [axis]: n }); };
    return (
      <span key={dimString(d)} className={`an-level ${isTimeDim(d) ? 'time' : ''}`}>
        <span className="an-level-n">{i + 1}</span>
        <span className="an-level-name">{d.key === 'worker.part-of' ? 'team' : d.key}</span>
        {isTimeDim(d) && (
          <select className="an-level-bucket" value={d.bucket ?? 'month'} title={`${TIME_FIELDS[d.key]} — bucketed by`} onChange={e => {
            const bucket = e.target.value as Bucket;
            if (bucket === 'span') { set({ [axis]: [...dims.filter((_, j) => j !== i), { key: d.key, bucket }] }); return; }
            set({ [axis]: dims.map((x, j) => (j === i ? { key: x.key, bucket } : x)) });
          }}>
            {BUCKETS.filter(b => b !== 'span' || axis === 'x').map(b => <option key={b} value={b}>{b === 'span' ? 'span · a track' : b}</option>)}
          </select>
        )}
        <button className="an-ib" title="Move out a level" disabled={i === 0} onClick={() => swap(i - 1)}>◂</button>
        <button className="an-ib" title="Move in a level" disabled={i === dims.length - 1 || isSpan(dims[i + 1])} onClick={() => swap(i + 1)}>▸</button>
        {!isSpan(d) && <button className="an-ib" title={`Move to ${other === 'x' ? 'columns' : 'rows'}`} onClick={() => set({ [axis]: dims.filter((_, j) => j !== i), [other]: [...q[other], d] })}>{other === 'x' ? '→' : '←'}</button>}
        <button className="an-ib x" title="Remove this level" onClick={() => set({ [axis]: dims.filter((_, j) => j !== i) })}>×</button>
      </span>
    );
  };
  const axisBox = (axis: 'x' | 'y') => (
    <div className={`an-axis an-axis-${axis}`}>
      <h2>{axis === 'y' ? 'Rows' : 'Columns'} <span className="muted">· {axis === 'y' ? 'Y' : 'X'}, outer first</span></h2>
      <div className="an-levels">
        {q[axis].map((d, i) => levelChip(axis, d, i))}
        <span className="an-picker">
          <button className="an-chip ghost" onClick={() => setPicking(picking === axis ? null : axis)}>+ level</button>
          {picking === axis && (
            <div className="an-menu" onMouseLeave={() => setPicking(null)}>
              <div className="an-menu-h">group by</div>
              {[...new Set([...QUICK_DIMS, ...facets.map(f => f.name)])].filter(k => !used.has(k)).map(k => (
                <button key={k} onClick={() => addLevel(axis, { key: k })}><span>{k === 'worker.part-of' ? 'team' : k}</span><span className="an-menu-how">{k === 'worker.part-of' ? 'worker.part-of' : k === 'kind' || k === 'status' ? k : 'property'}</span></button>
              ))}
              <input className="an-path" placeholder="a path: worker.part-of" title="A property, or a path of links — worker.part-of is the team of the worker"
                onKeyDown={e => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) addLevel(axis, { key: v }); if (e.key === 'Escape') setPicking(null); }} />
              <div className="an-menu-h">time · a date field, bucketed</div>
              {Object.entries(TIME_FIELDS).filter(([k]) => !used.has(k)).map(([k, how]) => (
                <button key={k} onClick={() => addLevel(axis, { key: k, bucket: 'month' })}><span>{k}</span><span className="an-menu-how">{how}</span></button>
              ))}
              {axis === 'x' && !q.x.some(isSpan) && <button onClick={() => { setTrack(); setPicking(null); }}><span>when · a track</span><span className="an-menu-how">the Gantt, last level</span></button>}
            </div>
          )}
        </span>
        {!q[axis].length && <span className="muted small">{axis === 'y' ? 'one row of everything' : 'one column of all'}</span>}
      </div>
    </div>
  );

  return (
    <section className="anwrap">
      <div className="anbar">
        <span className="an-group">
          <span className="muted small">kinds</span>
          {kinds.map(k => <button key={k} className={`an-chip ${q.kinds.includes(k) ? 'on' : ''}`} onClick={() => toggleKind(k)}>{k}</button>)}
        </span>
        <span className="an-group">
          <span className="muted small">where</span>
          {Object.entries(q.props).map(([k, v]) => (
            <span key={k} className="an-filter">
              <b>{k}</b>
              <input list={`anv-${k}`} defaultValue={v} onBlur={e => { if (e.target.value.trim() !== v) setFilter(k, e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
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
            : <button className="an-chip ghost" onClick={() => setAdding({ name: '', value: '' })} title="Filter by a property — quarter=q3, worker=ana, worker.part-of=Till">+ filter</button>}
        </span>
        {analytics.span && (
          <span className="an-group">
            <span className="muted small">from</span>
            <input className="an-date" type="date" value={q.from} onChange={e => set({ from: e.target.value })} />
            <span className="muted small">to</span>
            <input className="an-date" type="date" value={q.to} onChange={e => set({ to: e.target.value })} />
            {(q.from || q.to) && <button className="an-chip" onClick={() => set({ from: '', to: '' })} title="Fit the window to what is on the track">fit</button>}
          </span>
        )}
        <input className="an-find" defaultValue={q.q} placeholder="words…" onBlur={e => { if (e.target.value.trim() !== q.q) set({ q: e.target.value.trim() }); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <span className="an-count muted small">{analytics.total} on the page{analytics.undated ? ` · ${analytics.undated} with no dates` : ''}{saving ? ' · saving…' : ''}</span>
      </div>
      <div className="an-axes">
        {axisBox('y')}
        <button className="an-swap" title="Swap rows and columns" onClick={() => set({ x: q.y, y: q.x.filter(d => !isSpan(d)) })}>⇄</button>
        {axisBox('x')}
      </div>

      {!analytics.total ? (
        <p className="an-empty muted">
          {analytics.span
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
                      <div className="an-ax">{q.y.map(d => d.key).join(' ▸ ') || 'everything'}</div>
                      <div className="an-ax muted">↓ rows · columns → {[...xdims.map(d => d.key), ...(analytics.span ? ['when'] : [])].join(' ▸ ') || 'all'}</div>
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
