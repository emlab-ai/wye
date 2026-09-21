'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { KindPill, StatusPill } from './Pills';
import { EmbeddedCard } from './EmbeddedCard';
import { KINDS } from '@/lib/ids';
import { docRoute } from '@/lib/doc';
import type { InstanceRow, InstanceTable as Table } from '@/lib/instance-table';

// The search panel (req:wf2.ui.search): ⌘F / Ctrl+F from anywhere. Type text to search every block's id, title and
// text; start with a kind — `page: login`, `req:`, `decision: stop` — to search one kind (page is a document). The
// hits list on the left, the highlighted hit's card on the right as the preview; ↑ ↓ move, Enter opens the search
// page with every hit as blocks, a click on a hit opens its document, Esc closes.
export function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { product } = usePeek(); const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<InstanceRow[] | null>(null);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setTimeout(() => input.current?.select(), 0); if (!rows) fetch(`/api/${product}/view/node`).then(r => r.json()).then((t: Table) => setRows(t.rows)).catch(() => setRows([])); } }, [open, product, rows]);
  // `kind: text` — a kind prefix narrows the search; `page` means a document (a module node)
  const parsed = useMemo(() => {
    const m = q.match(/^([a-z][a-z-]*):\s*(.*)$/);
    const kind = m && ((KINDS as readonly string[]).includes(m[1]) || m[1] === 'page' || /^[a-z][a-z-]*$/.test(m[1])) ? m[1] : '';
    return { kind, text: (kind ? m![2] : q).trim().toLowerCase() };
  }, [q]);
  const hits = useMemo(() => {
    if (!rows) return [];
    const k = parsed.kind === 'page' ? 'module' : parsed.kind;
    const t = parsed.text;
    if (!k && !t) return [];
    const score = (r: InstanceRow) => r.id.toLowerCase().includes(t) ? 3 : r.title.toLowerCase().includes(t) ? 2 : (r.text ?? '').toLowerCase().includes(t) ? 1 : 0;
    return rows.filter(r => (!k || r.kind === k)).map(r => [r, t ? score(r) : 1] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0].id.localeCompare(b[0].id)).slice(0, 40).map(([r]) => r);
  }, [rows, parsed]);
  useEffect(() => { setSel(0); }, [q]);
  const href = (r: InstanceRow) => { const w = docRoute(r.file); return w ? `/${product}/${w.project}/d/${w.doc}#n-${encodeURIComponent(r.id)}` : `/${product}`; };
  const openAll = () => { const p = new URLSearchParams(); if (parsed.text) p.set('q', parsed.text); if (parsed.kind) p.set('kind', parsed.kind); router.push(`/${product}/search?${p.toString()}`); onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(hits.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey) { if (hits[sel]) { router.push(href(hits[sel])); onClose(); } } else openAll(); }
  };
  if (!open) return null;
  const cur = hits[sel];
  const snippet = (r: InstanceRow) => { const t = r.text ?? ''; const i = parsed.text ? t.toLowerCase().indexOf(parsed.text) : -1; return i < 0 ? t.slice(0, 120) : '…' + t.slice(Math.max(0, i - 40), i + 80) + '…'; };
  return (
    <div className="search-veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-panel" role="dialog" aria-label="Search">
        <input ref={input} className="search-in" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search blocks — text, or a kind first: page: login · req: stop · decision:" autoFocus />
        <div className="search-body">
          <ul className="search-hits">
            {hits.map((r, i) => (
              <li key={r.id} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => { router.push(href(r)); onClose(); }}>
                <div className="search-hit-head"><KindPill kind={r.kind} /><span className="search-hit-title">{r.title || r.id}</span><StatusPill status={r.status} /></div>
                <div className="search-hit-sub muted">{r.id} · {r.doc}</div>
                {parsed.text && r.text && <div className="search-hit-snip muted">{snippet(r)}</div>}
              </li>))}
            {rows && !hits.length && q && <li className="muted search-none">Nothing matches.</li>}
            {!rows && <li className="muted search-none">loading…</li>}
          </ul>
          <div className="search-preview">{cur ? <EmbeddedCard id={cur.id} /> : <p className="muted">Type to search. <b>Enter</b> opens every hit as blocks; <b>⌘Enter</b> opens the highlighted one; a kind first (<code>page:</code>, <code>req:</code>) narrows.</p>}</div>
        </div>
        <div className="search-foot muted">{hits.length ? `${hits.length}${hits.length === 40 ? '+' : ''} hits · ` : ''}↑↓ move · Enter all as blocks · ⌘Enter open · Esc close</div>
      </div>
    </div>
  );
}
