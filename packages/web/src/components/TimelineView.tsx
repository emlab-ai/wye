'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { daysBetween, isDay, parseTimelineQuery, ticksFor, timelineQueryString, type Item, type Timeline, type TimelineQuery } from '@/lib/timeline';

// The timeline page (component:timeline-view, decision:wf2.timeline-is-a-query): a strip that edits the page's query
// and a chart under it. Every bar is a node that says when it happens — `starts` / `ends`, a `duration`, a `due` date —
// and the rows are whatever the query groups by, a property or a path of links (`worker.part-of` puts a person's work
// under their team). Clicking a bar selects the node in the Context panel, the way a click on a block does
// (rule:block-select); the dates themselves are edited on its card there.
interface Props { product: string; project: string; slug: string; query: string; timeline: Timeline; kinds: string[] }

const QUICK_ROWS = ['worker', 'owner', 'status', 'kind', 'part-of'];
const MIN_BAR = 0.8;   // a one-day bar is still visible, in percent of the window
const LANE = 26;       // the height of one lane of bars inside a row

export function TimelineView({ product, project, slug, query, timeline, kinds }: Props) {
  const router = useRouter();
  const { select, setShowContext, index } = usePeek();
  const [saving, setSaving] = useState(false);
  const q = useMemo(() => parseTimelineQuery(query), [query]);

  // the query lives in the page's front matter, so changing it is an ordinary document write
  const write = useCallback(async (next: TimelineQuery) => {
    setSaving(true);
    await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { query: timelineQueryString(next) } }) });
    setSaving(false);
    router.refresh();
  }, [product, project, slug, router]);
  const set = (patch: Partial<TimelineQuery>) => void write({ ...q, ...patch });
  const toggleKind = (k: string) => set({ kinds: q.kinds.includes(k) ? q.kinds.filter(x => x !== k) : [...q.kinds, k] });
  const toggleRow = (r: string) => set({ rows: q.rows.includes(r) ? q.rows.filter(x => x !== r) : [...q.rows, r] });

  const { from, to } = timeline;
  const span = isDay(from) && isDay(to) ? Math.max(1, daysBetween(from, to)) : 0;
  const at = (d: string) => (span ? Math.max(0, Math.min(100, (daysBetween(from, d) / span) * 100)) : 0);
  const ticks = ticksFor(from, to);
  const today = new Date().toISOString().slice(0, 10);
  const now = span && today >= from && today <= to ? at(today) : null;

  const open = (id: string) => { setShowContext(true); select(id); };
  const bar = (i: Item) => {
    const left = at(i.from);
    const width = Math.max(MIN_BAR, at(i.to) - left);
    const title = `${i.title} · ${i.from}${i.to !== i.from ? ` → ${i.to}` : ''}${i.status ? ` · ${i.status}` : ''}`;
    return (
      <button key={i.id} className={`tl-bar k-${i.kind} ${i.point ? 'point' : ''} s-${i.status || 'none'}`} style={{ left: `${left}%`, width: i.point ? undefined : `${width}%`, top: 3 + i.lane * LANE }}
        title={title} onClick={() => open(i.id)}>
        <span className="tl-bar-label">{i.title}</span>
      </button>
    );
  };

  return (
    <section className="tlwrap">
      <div className="tlbar">
        <span className="tl-group">
          <span className="muted small">kinds</span>
          {kinds.map(k => <button key={k} className={`tl-chip ${q.kinds.includes(k) ? 'on' : ''}`} onClick={() => toggleKind(k)}>{k}</button>)}
        </span>
        <span className="tl-group">
          <span className="muted small">rows</span>
          {QUICK_ROWS.map(r => <button key={r} className={`tl-chip ${q.rows.includes(r) ? 'on' : ''}`} onClick={() => toggleRow(r)}>{r}</button>)}
          <input className="tl-rows-in" defaultValue={q.rows.join(',')} placeholder="worker.part-of,worker"
            onBlur={e => { const v = e.target.value.split(',').map(x => x.trim()).filter(Boolean); if (v.join(',') !== q.rows.join(',')) set({ rows: v }); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} title="Group the rows by a property, or by a path of links — worker.part-of is the team of the worker" />
        </span>
        <span className="tl-group">
          <span className="muted small">from</span>
          <input className="tl-date" type="date" value={q.from} onChange={e => set({ from: e.target.value })} />
          <span className="muted small">to</span>
          <input className="tl-date" type="date" value={q.to} onChange={e => set({ to: e.target.value })} />
          {(q.from || q.to) && <button className="tl-chip" onClick={() => set({ from: '', to: '' })} title="Fit the window to what is on the chart">fit</button>}
        </span>
        <input className="tl-find" defaultValue={q.q} placeholder="words…" onBlur={e => { if (e.target.value.trim() !== q.q) set({ q: e.target.value.trim() }); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <span className="tl-count muted small">{timeline.total} on the chart{timeline.undated ? ` · ${timeline.undated} with no dates` : ''}{saving ? ' · saving…' : ''}</span>
      </div>

      {!span ? (
        <p className="tl-empty muted">Nothing on this timeline yet. A node joins it by saying when it happens — <code>starts</code> and <code>ends</code>, a <code>duration</code>, or a <code>due</code> date — and the strip above chooses which nodes it watches.</p>
      ) : (
        <div className="tlchart">
          <div className="tl-head">
            <div className="tl-rowhead muted small">{from} → {to}</div>
            <div className="tl-track">
              {ticks.map(t => <span key={t.at} className={`tl-tick ${t.major ? 'major' : ''}`} style={{ left: `${at(t.at)}%` }}><i />{t.label}</span>)}
              {now !== null && <span className="tl-now" style={{ left: `${now}%` }} title={`today · ${today}`} />}
            </div>
          </div>
          <div className="tl-body">
            {timeline.rows.map(r => (
              <div key={r.key} className="tl-row">
                <div className="tl-rowhead">
                  {r.labels.map((l, i) => (
                    <span key={i} className={`tl-label ${i < r.labels.length - 1 ? 'up' : ''}`}>
                      {r.ids[i] && index[r.ids[i]] ? <button className="linkish" onClick={() => open(r.ids[i])}>{l}</button> : l}
                      {i < r.labels.length - 1 ? <b> ▸ </b> : null}
                    </span>
                  ))}
                  <span className="tl-rowcount muted">{r.items.length}</span>
                </div>
                <div className="tl-track" style={{ minHeight: r.lanes * LANE + 4 }}>
                  {ticks.map(t => <i key={t.at} className={`tl-grid ${t.major ? 'major' : ''}`} style={{ left: `${at(t.at)}%` }} />)}
                  {now !== null && <span className="tl-now" style={{ left: `${now}%` }} />}
                  {r.items.map(bar)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}