'use client';
import { useState } from 'react';
import { LiveTable } from './LiveTable';
import { usePeek } from './PeekProvider';

// A Knowledge page of one kind (decision:wf2.knowledge-pages-are-data-tables): the same Data table / Data list a page
// holds, from the whole product — rows edited in place, the filter on top — with table ⇄ list. The filter and the
// view live in the URL, so a filtered list is a link.
export function KindTable({ product, kind, initialQuery, initialView }: { product: string; kind: string; initialQuery: string; initialView: string }) {
  const { ownTypes } = usePeek();
  const [query, setQuery] = useState(initialQuery);
  const [view, setView] = useState(initialView === 'list' ? 'list' : 'table');
  const toUrl = (q: string, v: string) => {
    const p = new URLSearchParams();
    for (const [, k, quoted, bare] of q.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|(\S+))/g)) p.set(k, quoted ?? bare ?? '');
    if (v === 'list') p.set('as', 'list');
    history.replaceState(null, '', location.pathname + (p.toString() ? `?${p.toString().replace(/%3A/g, ':')}` : ''));
  };
  const type = kind === 'goal' || kind === 'task' ? undefined : ownTypes.find(t => t.slug === kind);
  const toggle = (
    <span className="kind-views" role="tablist" aria-label="View">
      {(['table', 'list'] as const).map(v => <button key={v} type="button" role="tab" aria-selected={view === v} className={`collection-view-toggle ${view === v ? 'on' : ''}`} onClick={() => { setView(v); toUrl(query, v); }}>{v === 'table' ? '▤ table' : '☰ list'}</button>)}
    </span>
  );
  return <LiveTable product={product} kind={kind} query={query} view={view} type={type} head={toggle} onQuery={q => { setQuery(q); toUrl(q, view); }} />;
}
