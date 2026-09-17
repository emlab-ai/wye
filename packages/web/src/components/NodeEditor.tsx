'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { KindPill, StatusPill } from './Pills';
import { Linkified } from './IdLink';
import { parseBody } from '@/lib/graph';
import type { TypeDef, NodeProp } from '@/lib/types';
import { assetBase, type IndexEntry } from '@/lib/doc';
import { STATUSES } from '@/lib/props';

// The keys a card's main text lives under (the same order the server's patchYamlCard uses)
const TEXT_KEYS = ['text', 'statement', 'description', 'purpose', 'q', 'title'];
const HIDDEN = new Set(['id', 'title', 'status', 'text', 'session']);

// Asana-style editing of any node in the right column: its text, status and every property — the ones its type
// declares (enum → select, bool → checkbox, ref → an id with the instances of that type suggested) and the ones the
// card already carries. Every change writes back to the node's defining line or yaml card and rebuilds the graph
// (bug:properties-need-to-be). Goals and tasks have their own TrackEditor.
export function NodeEditor({ id, body, form, type, props, entry, onSaved }: { id: string; body: string; form: string; type: TypeDef | null; props: NodeProp[]; entry?: IndexEntry; onSaved: () => void }) {
  const { product, index } = usePeek(); const router = useRouter();
  const rows = parseBody(body);
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const textKey = TEXT_KEYS.find(k => rows.some(r => r.key === k)) ?? 'text';
  const status = get('status').split(/\s+#/)[0].trim() || entry?.status || '';
  // fields: the type's declared properties (own and inherited, the root's left out), then keys the card has beyond them
  const declared = props.filter(p => p.from !== 'type:node' && !HIDDEN.has(p.name));
  const extra = rows.filter(r => !HIDDEN.has(r.key) && r.key !== textKey && !declared.some(p => p.name === r.key)).map(r => ({ name: r.key, type: r.prose || r.value.includes('\n') ? 'text' : 'string', ref: null, many: false, enum: null, required: false, from: '', inverse: null, value: r.value } as NodeProp));
  const fields = [...declared, ...extra];
  const [text, setText] = useState(get(textKey));
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(f => [f.name, f.value ?? get(f.name)])));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  // a refresh after our own save must not clobber what is being typed elsewhere: sync only the fields that changed
  const prev = useRef(body);
  useEffect(() => { if (body === prev.current) return; const was = parseBody(prev.current), now = parseBody(body); const v = (rs: typeof was, k: string) => rs.find(r => r.key === k)?.value ?? '';
    if (v(was, textKey) !== v(now, textKey)) setText(v(now, textKey));
    setVals(cur => { const next = { ...cur }; for (const f of fields) if (v(was, f.name) !== v(now, f.name)) next[f.name] = v(now, f.name); return next; });
    prev.current = body; }, [body]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (patch: { status?: string; text?: string; props?: Record<string, string | null> }) => {
    setState('saving'); setMsg('');
    const r = await fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setState('error'); setMsg(j.message ?? j.error ?? 'could not save'); return; }
    setState('saved'); onSaved(); router.refresh();
  };
  const setVal = (name: string, v: string) => setVals(c => ({ ...c, [name]: v }));
  const commit = (f: NodeProp) => { const v = (vals[f.name] ?? '').trim(); if (v !== (f.value ?? get(f.name)).trim()) save({ props: { [f.name]: v || null } }); };
  // suggestions for a ref: the defined instances of that type
  const suggest = (f: NodeProp) => f.ref ? Object.values(index).filter(e => e.defined && e.kind === f.ref).map(e => e.id).sort() : [];
  const base = entry?.file ? assetBase(entry.file) : '';
  const kind = id.split(':')[0];
  const prose = form === 'prose';
  return (
    <section className="tracking edit node-edit">
      <article className="card" id={`n-${id}`}>
        <header><KindPill kind={kind} /><StatusPill status={status} /><code className="cid">{id}</code></header>
        <textarea className="track-title" value={text} rows={Math.min(8, Math.max(2, Math.ceil(text.length / 60)))} placeholder={`${textKey}…`} onChange={e => setText(e.target.value)} onBlur={() => { if (text.trim() && text !== get(textKey)) save({ text: text.replace(/\s*\n\s*/g, prose ? ' ' : '\n') }); }} />
        {/\!\[/.test(text) && <p className="para muted small"><Linkified text={text.match(/!\[[^\]]*\]\([^)]+\)/g)?.join(' ') ?? ''} base={base} /></p>}
      </article>
      <div className="tracking-grid">
        <div><small>status</small>
          <select className={`status-sel s-${status}`} value={status} onChange={e => save({ status: e.target.value })}>
            {(STATUSES.includes(status) ? [] : [status]).concat(STATUSES).map(st => <option key={st} value={st}>{st || '— status'}</option>)}
          </select>
        </div>
        {fields.map(f => (
          <div key={f.name} className={f.type === 'text' || (vals[f.name] ?? '').includes('\n') ? 'node-edit-wide' : ''}>
            <small title={f.from ? (f.from === type?.id ? `declared on ${f.from}` : `inherited from ${f.from}`) : 'a key this card carries'}>{f.name}{f.from && f.from !== type?.id && <> <span className="muted">{f.from.slice(5)}</span></>}{f.required && !vals[f.name] && <span className="bad"> required</span>}</small>
            {f.enum ? (
              <select value={vals[f.name] ?? ''} onChange={e => { setVal(f.name, e.target.value); save({ props: { [f.name]: e.target.value || null } }); }}>
                {(vals[f.name] && !f.enum.includes(vals[f.name]) ? [vals[f.name]] : []).concat(['', ...f.enum]).map(v => <option key={v} value={v}>{v || '—'}</option>)}
              </select>
            ) : f.type === 'bool' ? (
              <input type="checkbox" checked={/^(true|yes)$/i.test(vals[f.name] ?? '')} onChange={e => { setVal(f.name, e.target.checked ? 'true' : ''); save({ props: { [f.name]: e.target.checked ? 'true' : null } }); }} />
            ) : f.type === 'text' || (vals[f.name] ?? '').includes('\n') ? (
              <textarea className="nrow-in" rows={Math.min(8, Math.max(2, (vals[f.name] ?? '').split('\n').length + 1))} value={vals[f.name] ?? ''} onChange={e => setVal(f.name, e.target.value)} onBlur={() => commit(f)} disabled={prose} title={prose ? 'a prose line holds single-line values; open the document for a long text' : ''} />
            ) : (
              <>
                <input className="nrow-in" list={f.ref ? `wf-ref-${f.ref}` : undefined} value={vals[f.name] ?? ''} placeholder={f.ref ? `${f.ref}:…${f.many ? ', …' : ''}` : f.type} onChange={e => setVal(f.name, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={() => commit(f)} />
                {f.ref && <datalist id={`wf-ref-${f.ref}`}>{suggest(f).map(x => <option key={x} value={x}>{index[x]?.title}</option>)}</datalist>}
                {f.ref && (vals[f.name] ?? '').trim() && <span className="list">{(vals[f.name] ?? '').replace(/^\[|\]$/g, '').split(/,\s*/).filter(x => /^[a-z][a-z0-9-]*:/.test(x)).map(x => <span key={x} className="item"><SmartTag id={x} /></span>)}</span>}
              </>
            )}
          </div>))}
      </div>
      <p className="track-state">{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved to the document' : state === 'error' ? `save failed: ${msg}` : <>changes save to {prose ? 'the defining line' : 'the yaml card'} in the document{type && <> · <Link href={`/${product}/types/${type.slug}`}>type:{type.slug}</Link></>}</>}</p>
    </section>
  );
}
