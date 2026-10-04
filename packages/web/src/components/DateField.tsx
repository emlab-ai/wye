'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fitMenu } from '@/lib/menu-fit';

// A date property (`due`, a type's `date` column) or a month one (`target: month`): typed as it is written —
// YYYY-MM-DD, YYYY-MM — or picked from a calendar that opens from the ▦ beside it, with quick picks (today, tomorrow,
// next Monday, in a week; this month, next month) and Clear. The value is committed on a pick, on Enter or on blur.

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v: string) => { const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1) : null; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DateField({ value, onCommit, month = false, className = 'ne-in', placeholder }: { value: string; onCommit: (v: string) => void; month?: boolean; className?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [open, setOpen] = useState<{ x: number; y: number; above: number } | null>(null);
  useEffect(() => setV(value), [value]);
  const commit = (next: string) => { setV(next); setOpen(null); if (next !== value) onCommit(next); };
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <span className="date-field" onMouseDown={e => e.stopPropagation()}>
      <input className={className} value={v} placeholder={placeholder ?? (month ? 'YYYY-MM' : 'YYYY-MM-DD')} onChange={e => setV(e.target.value)}
        onBlur={() => { if (!open && v !== value) onCommit(v.trim()); }}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
      <button ref={btn} type="button" className="date-btn" title={month ? 'pick a month' : 'pick a date'} aria-label="open calendar"
        onClick={() => { const b = btn.current!.getBoundingClientRect(); setOpen(o => o ? null : { x: b.right - 250, y: b.bottom + 4, above: b.top }); }}>▦</button>
      {open && createPortal(<Calendar at={open} value={v} month={month} onPick={commit} onClose={() => setOpen(null)} />, document.body)}
    </span>
  );
}

function Calendar({ at, value, month, onPick, onClose }: { at: { x: number; y: number; above: number }; value: string; month: boolean; onPick: (v: string) => void; onClose: () => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cur = parse(value);
  const [view, setView] = useState(() => { const d = cur ?? today; return new Date(d.getFullYear(), month ? 0 : d.getMonth(), 1); });
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => fitMenu(el.current, Math.max(8, at.x), at.y, at.above), [at]);
  useEffect(() => {   // a press outside, Escape or a scroll closes it (check the target: React listens on document too)
    const close = (e: Event) => { if (!(e.target instanceof Node && el.current?.contains(e.target))) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); };
  }, [onClose]);
  const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const nextMonday = addDays(today, ((8 - today.getDay()) % 7) || 7);
  const quick: [string, string][] = month
    ? [['This month', monthOf(today)], ['Next month', monthOf(new Date(today.getFullYear(), today.getMonth() + 1, 1))], ['In 3 months', monthOf(new Date(today.getFullYear(), today.getMonth() + 3, 1))]]
    : [['Today', iso(today)], ['Tomorrow', iso(addDays(today, 1))], ['Next Monday', iso(nextMonday)], ['In a week', iso(addDays(today, 7))]];

  let body: React.ReactNode;
  if (month) {
    body = <div className="cal-months">{MONTHS.map((m, i) => { const key = `${view.getFullYear()}-${pad(i + 1)}`; return <button key={m} type="button" className={`${value.startsWith(key) ? 'on' : ''} ${key === monthOf(today) ? 'today' : ''}`} onClick={() => onPick(key)}>{m}</button>; })}</div>;
  } else {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));   // weeks start on Monday
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    body = (
      <div className="cal-grid">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d} className="cal-dow">{d}</span>)}
        {days.map(d => <button key={iso(d)} type="button" className={`${d.getMonth() !== view.getMonth() ? 'out' : ''} ${iso(d) === value ? 'on' : ''} ${iso(d) === iso(today) ? 'today' : ''}`} onClick={() => onPick(iso(d))}>{d.getDate()}</button>)}
      </div>
    );
  }
  const step = (n: number) => setView(v => month ? new Date(v.getFullYear() + n, 0, 1) : new Date(v.getFullYear(), v.getMonth() + n, 1));
  return (
    <div ref={el} className="cal-pop" role="dialog" aria-label={month ? 'pick a month' : 'pick a date'} style={{ left: at.x, top: at.y }}>
      <div className="cal-head">
        <button type="button" onClick={() => step(-1)} aria-label="previous">‹</button>
        <span>{month ? view.getFullYear() : `${MONTHS[view.getMonth()]} ${view.getFullYear()}`}</span>
        <button type="button" onClick={() => step(1)} aria-label="next">›</button>
      </div>
      {body}
      <div className="cal-quick">{quick.map(([l, d]) => <button key={l} type="button" onClick={() => onPick(d)}>{l}</button>)}<button type="button" className="cal-clear" onClick={() => onPick('')}>Clear</button></div>
    </div>
  );
}
