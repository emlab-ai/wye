'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type KindOption = { value: string; label?: string; hint?: string };

// A kind chosen from a list that can be long (every type of the product, forty and more): a small pill that opens a
// popover with a filter field — type to narrow, ↑ ↓ to move, Enter to take, Escape to leave — over a list that
// scrolls. Replaces the native select wherever a kind or a type is picked (decision:waterfall.kind-picker): the same
// size everywhere, the kind's colour on the pill, never a menu taller than the screen.
export function KindPicker({ value, options, onChange, disabled, title, className = '', placeholder = 'type to filter…', empty, colour = true, align = 'left', stopMouseDown }: {
  value: string; options: (string | KindOption)[]; onChange: (v: string) => void; disabled?: boolean; title?: string; className?: string; placeholder?: string;
  /** a first row that clears the choice, with this label */ empty?: string; /** the pill in the kind's colour (a type) or plain (anything else) */ colour?: boolean; align?: 'left' | 'right';
  /** inside an editor that takes the mouse (BlockNote): stop mousedown from reaching it */ stopMouseDown?: boolean;
}) {
  const opts = useMemo(() => options.map(o => (typeof o === 'string' ? { value: o } : o)), [options]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const btn = useRef<HTMLButtonElement>(null); const pop = useRef<HTMLDivElement>(null); const field = useRef<HTMLInputElement>(null); const list = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; right?: number } | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = t ? opts.filter(o => o.value.toLowerCase().includes(t) || (o.label ?? '').toLowerCase().includes(t)) : opts;
    // what starts with the text first, then what holds it
    return t ? [...rows.filter(o => (o.label ?? o.value).toLowerCase().startsWith(t)), ...rows.filter(o => !(o.label ?? o.value).toLowerCase().startsWith(t))] : rows;
  }, [opts, q]);
  const current = opts.find(o => o.value === value);
  const place = () => { const r = btn.current?.getBoundingClientRect(); if (!r) return; const below = window.innerHeight - r.bottom > 300 || r.top < 300; setPos({ left: align === 'left' ? r.left : Math.max(8, r.right - 240), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - Math.min(300, 44 + shown.length * 26)) }); };
  const show = () => { if (disabled) return; setQ(''); setAt(Math.max(0, shown.findIndex(o => o.value === value))); setOpen(true); };
  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && pos) field.current?.focus(); }, [open, pos]); // the field exists once the popover is placed
  useEffect(() => { setAt(a => Math.min(a, Math.max(0, shown.length - 1))); }, [shown]);
  useEffect(() => { const el = list.current?.children[at] as HTMLElement | undefined; el?.scrollIntoView?.({ block: 'nearest' }); }, [at, open]);
  // closes on a press outside — the document is React's root, so the handler checks where the press was
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (pop.current?.contains(t) || btn.current?.contains(t)) return; setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', down, true); document.addEventListener('keydown', key, true); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const take = (v: string) => { setOpen(false); if (v !== value) onChange(v); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = shown[at]; if (o) take(o.value); else if (empty !== undefined && !q.trim()) take(''); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const dot = (k: string) => colour ? <i className="kp-dot" style={{ background: `var(--k-${k}, var(--k-other))` }} /> : null;
  return (
    <span className={`kp ${className}`} onMouseDown={stopMouseDown ? e => e.stopPropagation() : undefined}>
      <button ref={btn} type="button" className={`kp-pill ${colour ? 'k' : ''} ${disabled ? 'off' : ''}`} style={colour && value ? { background: `var(--k-${value}, var(--k-other))` } : undefined} disabled={disabled} title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
        {current ? (current.label ?? current.value) : value || empty || '—'}<span className="kp-caret" aria-hidden>▾</span>
      </button>
      {open && pos && (
        <div ref={pop} className="kp-pop" style={{ left: pos.left, top: pos.top }} role="dialog">
          <input ref={field} className="kp-find" value={q} placeholder={placeholder} onChange={e => { setQ(e.target.value); setAt(0); }} onKeyDown={onKey} spellCheck={false} />
          <ul ref={list} className="kp-list" role="listbox">
            {empty !== undefined && !q.trim() && <li role="option" aria-selected={!value} className={`kp-row ${!value ? 'on' : ''}`} onMouseDown={e => { e.preventDefault(); take(''); }}>{empty}</li>}
            {shown.map((o, i) => <li key={o.value} role="option" aria-selected={o.value === value} className={`kp-row ${i === at ? 'at' : ''} ${o.value === value ? 'on' : ''}`} onMouseEnter={() => setAt(i)} onMouseDown={e => { e.preventDefault(); take(o.value); }}>{dot(o.value)}<span className="kp-name">{o.label ?? o.value}</span>{o.hint && <small className="kp-hint">{o.hint}</small>}</li>)}
            {!shown.length && <li className="kp-none">nothing matches “{q}”</li>}
          </ul>
        </div>
      )}
    </span>
  );
}
