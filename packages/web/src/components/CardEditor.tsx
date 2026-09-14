'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bodyToFields, fieldsToBody, type FormField } from '@/lib/yaml-form';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { KindPill, StatusPill, StubPill } from './Pills';
import type { IndexEntry } from '@/lib/doc';

const STATUSES = ['proposed', 'approved', 'unverified', 'api-only', 'shipped', 'deprecated', 'question'];
const SENTENCE: Record<string, string> = { when: 'When', then: 'then', unless: 'unless' };

// A node card whose every field is live: title, status, sentence keys, prose, lists (as tag chips), the rest as
// text. Changes autosave after a short debounce with the chunk's current hash; the yaml is available raw too.
export function CardEditor({ project, slug, segment, chunk, id, body, ifMatch, entry }: { project: string; slug: string; segment: number; chunk: number; id: string; body: string; ifMatch: string; entry?: IndexEntry }) {
  const router = useRouter();
  const { index } = usePeek();
  const ids = useMemo(() => Object.keys(index).sort(), [index]);
  const [fields, setFields] = useState<FormField[]>(() => bodyToFields(body).fields);
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState(body);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const hash = useRef(ifMatch);
  const lastSaved = useRef(body);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { hash.current = ifMatch; if (body !== lastSaved.current) { setFields(bodyToFields(body).fields); setRaw(body); lastSaved.current = body; } }, [ifMatch, body]);

  async function save(next: string) {
    if (next === lastSaved.current) return;
    setState('saving');
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-chunk', segment, chunk, ifMatch: hash.current, body: next }) });
    const j = await r.json();
    if (!r.ok) { setState(j.error === 'conflict' ? 'conflict' : 'error'); return; }
    lastSaved.current = next;
    hash.current = ((j.hashes as (string[] | null)[])[segment] ?? [])[chunk] ?? hash.current;
    setState('saved'); router.refresh();
  }
  function queue(nextFields: FormField[]) {
    setFields(nextFields);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(fieldsToBody(id, nextFields)), 700);
  }
  const set = (key: string, value: string) => queue(fields.map(f => f.key === key ? { ...f, value } : f));
  const get = (key: string) => fields.find(f => f.key === key);
  const kind = id.split(':')[0];
  const status = get('status')?.value.split(/\s+#/)[0].trim() ?? entry?.status ?? '';
  const rest = fields.filter(f => !['title', 'status', 'when', 'then', 'unless'].includes(f.key));

  return (
    <article className={`card live-card ${rawMode ? 'raw' : ''}`} id={`n-${id}`}>
      <header>
        <KindPill kind={kind} />
        {get('status') ? (
          <select className="status-sel" value={status} onChange={e => set('status', e.target.value)}>{[status, ...STATUSES].filter((v, i, a) => a.indexOf(v) === i).map(v => <option key={v} value={v}>{v || '—'}</option>)}</select>
        ) : <StatusPill status={status} />}
        {entry && <StubPill defined={entry.defined} />}
        <span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'conflict' ? 'changed on disk — reload' : state === 'error' ? 'save failed' : ''}</span>
        <code className="cid">{id}</code>
        <button className="mini" onClick={() => setRawMode(v => !v)}>{rawMode ? 'fields' : 'yaml'}</button>
      </header>
      {rawMode ? (
        <textarea className="raw" value={raw} onChange={e => setRaw(e.target.value)} onBlur={() => { if (raw !== lastSaved.current) { setFields(bodyToFields(raw).fields); save(raw); } }} rows={Math.min(30, raw.split('\n').length + 1)} />
      ) : (
        <>
          {get('title') && <input className="title" value={get('title')!.value} placeholder="title" onChange={e => set('title', e.target.value)} />}
          {!get('title') && <h4>{id}</h4>}
          {['when', 'then', 'unless'].filter(k => get(k)).map(k => (
            <label key={k} className="sentence-field"><span className="pk">{SENTENCE[k]}</span><AutoArea value={get(k)!.value} onChange={v => set(k, v)} /></label>
          ))}
          <dl className="strip">
            {rest.map(f => (
              <div key={f.key}>
                <dt>{f.key}</dt>
                <dd>
                  {f.kind === 'list' ? <TagList value={f.value} ids={ids} onChange={v => set(f.key, v)} />
                    : f.kind === 'prose' || f.kind === 'nested' ? <AutoArea value={f.value} mono={f.kind === 'nested'} onChange={v => set(f.key, v)} />
                    : <input value={f.value} onChange={e => set(f.key, e.target.value)} />}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </article>
  );
}

function AutoArea({ value, onChange, mono }: { value: string; onChange: (v: string) => void; mono?: boolean }) {
  return <textarea className={`auto ${mono ? 'mono' : ''}`} value={value} rows={Math.max(1, Math.min(14, value.split('\n').length + (value.length > 90 ? Math.ceil(value.length / 95) - 1 : 0)))} onChange={e => onChange(e.target.value)} />;
}

// Comma-separated ids shown as tag chips with an input to add more (datalist autocomplete over all node ids).
function TagList({ value, ids, onChange }: { value: string; ids: string[]; onChange: (v: string) => void }) {
  const items = value.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  const [draft, setDraft] = useState('');
  const commit = () => { const v = draft.trim(); if (!v) return; onChange([...items, v].join(', ')); setDraft(''); };
  return (
    <span className="taglist">
      {items.map((it, i) => <span key={it + i} className="chip-x"><SmartTag id={it.replace(/#.*$/, '')} label={it} /><button onClick={() => onChange(items.filter((_, j) => j !== i).join(', '))} title="remove">×</button></span>)}
      <input list="wf-ids" value={draft} placeholder="+ id" onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }} onBlur={commit} />
      <datalist id="wf-ids">{ids.map(i => <option key={i} value={i} />)}</datalist>
    </span>
  );
}
