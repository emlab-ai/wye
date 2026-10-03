'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { KindPill } from './Pills';
import { EmbeddedCard } from './EmbeddedCard';
import { CodeView } from './CodeView';
import { AnswerView } from './search/AnswerView';
import { SourceChips } from './search/SourceChips';
import { useAsk } from './search/useAsk';
import { isQuestion } from '@/lib/ask/question';
import type { Citation, Hit, Source } from '@/lib/ask/types';

// The search panel (req:wf2.ui.search, decision:wf2.ask-in-search-panel): ⌘F from anywhere. Typing ranks passages from
// the product's blocks, documents, code and sessions — no model. Enter, or a question, asks: the fast answer streams
// with [n] citations, the sources the deep search opens appear as it works, and its deeper answer follows (open by
// itself when the fast one says the sources were thin). ⌘Enter opens the highlighted hit; follow-ups keep the thread.
const TABS: { key: Source | 'all'; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'node', label: 'Blocks' }, { key: 'doc', label: 'Docs' }, { key: 'code', label: 'Code' }, { key: 'session', label: 'Sessions' }];
type Pick = { source: Source; ref: string };

export function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { product } = usePeek(); const router = useRouter();
  const [q, setQ] = useState(''); const [tab, setTab] = useState<Source | 'all'>('all');
  const [hits, setHits] = useState<Hit[]>([]); const [degraded, setDegraded] = useState(''); const [sel, setSel] = useState(0);
  const [preview, setPreview] = useState<Pick | null>(null); const [showDeep, setShowDeep] = useState(false);
  const { state, ask, reset } = useAsk(product);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => input.current?.select(), 0); else { reset(); setQ(''); setHits([]); } }, [open, reset]);
  // typing → /search, debounced; a `kind:` prefix searches blocks of that kind
  const kind = useMemo(() => q.match(/^([a-z][a-z-]*):\s+(.*)$/)?.[1] ?? '', [q]);   // `req: stop`, `page: login` — the space keeps `req:x.y` a plain search
  useEffect(() => {
    const text = kind ? q.slice(kind.length + 1).trim() : q.trim(); if (text.length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ q: text, limit: '40' }); const src = kind === 'page' ? 'doc' : kind ? 'node' : tab === 'all' ? '' : tab; if (src) sp.set('source', src);
      fetch(`/api/${product}/search?${sp}`).then(r => r.json()).then((j: { hits?: Hit[]; degraded?: string }) => {
        const hs = (j.hits ?? []).filter(h => !kind || kind === 'page' || h.ref.startsWith(kind + ':'));
        setHits(hs); setDegraded(j.degraded ?? ''); setSel(0);
      }).catch(() => setHits([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q, tab, kind, product]);
  useEffect(() => { if (state?.fastDone && state.thin) setShowDeep(true); }, [state?.fastDone, state?.thin]);
  const go = (href: string | null, p?: Pick) => { if (href) { router.push(href); onClose(); } else if (p) setPreview(p); };
  const openCite = (c: Citation) => go(c.href, { source: c.source, ref: c.ref });
  const submit = () => { if (q.trim().length >= 3) { setShowDeep(false); ask(q.trim()); setQ(''); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(list.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if ((e.metaKey || e.ctrlKey) && list[sel]) go(list[sel].href, list[sel]); else submit(); }
  };
  const list = !q.trim() && state ? state.hits.filter(h => tab === 'all' || h.source === tab) : hits;
  if (!open) return null;
  const cur: Pick | null = preview ?? (list[sel] ? { source: list[sel].source, ref: list[sel].ref } : null);
  const openAll = () => { const sp = new URLSearchParams(); if (q.trim()) sp.set('q', q.trim()); router.push(`/${product}/search?${sp}`); onClose(); };
  return (
    <div className="search-veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-panel" role="dialog" aria-label="Search">
        <input ref={input} className="search-in" value={q} onChange={e => { setQ(e.target.value); setPreview(null); }} onKeyDown={onKey}
          placeholder={state ? 'Ask a follow-up…' : 'Search or ask — blocks, docs, code, sessions'} autoFocus />
        {q && isQuestion(q) && !state && <div className="ask-hint muted">Enter to ask</div>}
        {state && (
          <section className="ask-box" aria-live="polite">
            <div className="ask-head"><b>{state.q}</b>
              <span className="muted"> · fast {state.fastDone ? '✓' : '…'} · deep {state.deepDone ? (state.cut ? 'stopped at its limit' : '✓') : state.step || 'working…'}</span></div>
            {state.fast ? <AnswerView text={state.fast} cites={state.cites} onCite={openCite} onHover={c => setPreview({ source: c.source, ref: c.ref })} /> : !state.fastDone && <p className="muted">Writing an answer…</p>}
            <SourceChips items={state.found} onPick={openCite} onHover={c => setPreview({ source: c.source, ref: c.ref })} />
            {state.deep && (showDeep
              ? <div className="ask-deep"><div className="muted">Deeper answer</div><AnswerView text={state.deep} cites={state.cites} onCite={openCite} onHover={c => setPreview({ source: c.source, ref: c.ref })} /></div>
              : <button type="button" className="ask-more" onClick={() => setShowDeep(true)}>▸ Deeper answer {state.deepDone ? '(ready)' : '(writing…)'}</button>)}
            {state.errors.length > 0 && !state.fast && !state.deep && state.done && <p className="muted">Couldn’t write an answer — the sources are below.</p>}
          </section>)}
        <div className="search-tabs">{TABS.map(t => <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}{degraded && <span className="muted"> · keyword search only</span>}</div>
        <div className="search-body">
          <ul className="search-hits">
            {list.map((h, i) => (
              <li key={h.id} className={i === sel ? 'on' : ''} onMouseEnter={() => { setSel(i); setPreview(null); }} onClick={() => go(h.href, h)}>
                <div className="search-hit-head">{h.source === 'node' ? <KindPill kind={h.ref.split(':')[0]} /> : <span className={`ask-src ask-src-${h.source}`}>{h.source}</span>}<span className="search-hit-title">{h.title}</span></div>
                <div className="search-hit-snip muted">{h.via ? `via ${h.via} · ` : ''}{h.text.replace(/\s+/g, ' ').slice(0, 140)}</div>
              </li>))}
            {q.trim().length >= 2 && !hits.length && <li className="muted search-none">Nothing matches — Enter asks anyway.</li>}
          </ul>
          <div className="search-preview">{cur ? (cur.source === 'node' ? <EmbeddedCard id={cur.ref} /> : cur.source === 'code' ? <CodeView file={cur.ref.replace(/-\d+$/, '')} /> : <PassagePreview hit={list.find(h => h.ref === cur.ref)} cite={state?.found.find(f => f.ref === cur.ref)} />) : <p className="muted">Type to search; <b>Enter</b> asks. <b>⌘Enter</b> opens the highlighted hit.</p>}</div>
        </div>
        <div className="search-foot muted">↑↓ move · Enter ask · ⌘Enter open · <button type="button" className="link" onClick={openAll}>Open as blocks</button> · Esc close</div>
      </div>
    </div>
  );
}
function PassagePreview({ hit, cite }: { hit?: Hit; cite?: Citation }) {
  const title = hit?.title ?? cite?.title ?? ''; const text = hit?.text ?? cite?.snippet ?? '';
  return <div className="ask-passage"><b>{title}</b><p>{text}</p>{(hit?.href ?? cite?.href) && <a href={(hit?.href ?? cite?.href)!}>Open</a>}</div>;
}
