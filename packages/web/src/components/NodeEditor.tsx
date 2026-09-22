'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { codePaths, CODE_KEYS } from '@/lib/code-paths';
import { ProgressBar } from './Progress';
import { Linkified } from './IdLink';
import { parseBody } from '@/lib/graph';
import type { TypeDef, NodeProp } from '@/lib/types';
import { assetBase, type IndexEntry } from '@/lib/doc';
import { STATUSES, GOAL_STATUSES, TASK_STATUSES } from '@/lib/props';

// The keys a card's main text lives under (the same order the server's patchYamlCard uses)
const TEXT_KEYS = ['text', 'statement', 'description', 'purpose', 'q', 'title'];
const HIDDEN = new Set(['id', 'title', 'status', 'session', 'statement', 'note', 'when', 'then', 'unless', 'context', 'choice', 'alternatives', 'consequences']);   // part kinds: the text lives in child blocks (decision:wf2.parts-are-content), never in a property row
// tracking fields of goals and tasks, shown as property rows like any other (component:track-editor folded in here)
const TRACK: Record<string, { name: string; type: string }[]> = {
  goal: [{ name: 'target', type: 'month' }, { name: 'owner', type: 'string' }, { name: 'progress', type: 'progress' }, { name: 'part-of', type: 'ref goal' }],
  task: [{ name: 'due', type: 'date' }, { name: 'owner', type: 'string' }, { name: 'progress', type: 'progress' }, { name: 'part-of', type: 'ref goal' }],
};
type Field = { name: string; type: string; ref: string | null; many: boolean; enum: string[] | null; required: boolean; from: string; value: string };
const glyph = (f: Field) => f.name === 'status' ? '◔' : f.type === 'progress' ? '◐' : f.ref ? '↗' : f.type === 'text' ? '≡' : f.type === 'date' || f.type === 'month' ? '▦' : f.type === 'bool' ? '☑' : f.enum ? '◇' : f.type === 'number' ? '#' : '⋯';

// A node's page in the right column, laid out like a Notion task (task:new-826): the kind and id, then every
// property as a label/value row — the text itself is the first block of the Content editor under the properties
// (decision:wf2.text-is-first-block) — — status, the text, the properties its type declares (enum → select, bool →
// checkbox, ref → an id with that type's instances suggested), the keys the card carries, and for goals and tasks
// their tracking fields; empty optional ones fold under "n more properties". Every change saves to the defining
// line or the yaml card and rebuilds the graph (op:node.edit).
export function NodeEditor({ id, body, form, type, props, entry, relations = [], onSaved }: { id: string; body: string; form: string; type: TypeDef | null; props: NodeProp[]; entry?: IndexEntry; relations?: [string, string[]][]; onSaved: () => void }) {
  const { product, index, open: openNode } = usePeek(); const router = useRouter();
  const [addingFor, setAddingFor] = useState<string | null>(null); const [addText, setAddText] = useState('');
  const [addProp, setAddProp] = useState<{ name: string; value: string } | null>(null);
  const kind = id.split(':')[0]; const prose = form === 'prose';
  const rows = parseBody(body);
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const textKey = TEXT_KEYS.find(k => rows.some(r => r.key === k)) ?? 'text';
  // the title: a yaml card's title key when it has one, else the text itself (a prose node is its text)
  const titleKey = rows.some(r => r.key === 'title') ? 'title' : textKey;
  const status = get('status').split(/\s+#/)[0].trim() || entry?.status || '';
  // the type's properties; the root type's (related-to, depends-on, …) only when the node fills one in
  // the text key is the text field above (or the title), never a second row — type:question declares q itself
  const declared: Field[] = props.filter(p => (p.from !== 'type:node' || p.value) && p.name !== textKey && !HIDDEN.has(p.name) && p.name !== titleKey).map(p => ({ name: p.name, type: p.type, ref: p.ref, many: p.many, enum: p.enum, required: p.required, from: p.from, value: p.value }));
  const track: Field[] = (TRACK[kind] ?? []).filter(t => !declared.some(d => d.name === t.name)).map(t => ({ name: t.name, type: t.type.startsWith('ref ') ? 'ref' : t.type, ref: t.type.startsWith('ref ') ? t.type.slice(4) : null, many: false, enum: null, required: false, from: 'tracking', value: get(t.name) }));
  const carried: Field[] = rows.filter(r => !HIDDEN.has(r.key) && r.key !== titleKey && r.key !== textKey && !declared.some(p => p.name === r.key) && !track.some(t => t.name === r.key)).map(r => ({ name: r.key, type: r.prose || r.value.includes('\n') ? 'text' : 'string', ref: null, many: false, enum: null, required: false, from: '', value: r.value }));
  const textField: Field[] = titleKey !== textKey ? [{ name: textKey, type: 'text', ref: null, many: false, enum: null, required: false, from: 'type:node', value: get(textKey) }] : [];
  const fields = [...textField, ...track, ...declared, ...carried];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(f => [f.name, f.value])));
  const [more, setMore] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  // a refresh after our own save must not clobber what is being typed elsewhere: sync only the fields that changed
  const prev = useRef(body);
  useEffect(() => { if (body === prev.current) return; const was = parseBody(prev.current), now = parseBody(body); const v = (rs: typeof was, k: string) => rs.find(r => r.key === k)?.value ?? '';
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
  const commit = (f: Field) => { const v = (vals[f.name] ?? '').trim(); if (v !== f.value.trim()) save({ props: { [f.name]: v || null } }); };
  // instances of a ref's type to suggest; `ref node` means anything, too many to list — the tags still show
  const suggest = (f: Field) => f.ref && f.ref !== 'node' ? Object.values(index).filter(e => e.defined && e.kind === f.ref && e.id !== id).sort((a, b) => a.id.localeCompare(b.id)) : [];
  const statuses = kind === 'goal' ? ['', ...GOAL_STATUSES] : kind === 'task' ? ['', ...TASK_STATUSES] : STATUSES;
  const base = entry?.file ? assetBase(entry.file) : '';
  const computed = entry?.parts && entry.progress !== undefined && entry.progress === Math.round(100 * entry.parts.done / entry.parts.total) ? entry.progress : undefined;
  const always = new Set((TRACK[kind] ?? []).map(t => t.name));
  const isEmpty = (f: Field) => !(vals[f.name] ?? '').trim() && !f.required && f.type !== 'progress' && !always.has(f.name) && f.from !== 'type:node';
  const shown = fields.filter(f => more || !isEmpty(f)), hidden = fields.filter(isEmpty);
  const value = (f: Field) => {
    const v = vals[f.name] ?? '';
    const listOf = (raw: string) => raw.replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean);
    const writeList = (items: string[]) => { const next = items.length ? `[${items.join(', ')}]` : ''; setVal(f.name, next); save({ props: { [f.name]: next || null } }); };
    // many of values (decision:ontology.one-of-many-of): every value as a toggle
    if (f.enum && f.many) { const on = listOf(v); return (
      <span className="ne-multi">{[...new Set([...f.enum, ...on])].map(o => <button key={o} type="button" className={`ne-toggle ${on.includes(o) ? 'on' : ''}`} aria-pressed={on.includes(o)} onClick={() => writeList(on.includes(o) ? on.filter(x => x !== o) : [...on, o])}>{o}</button>)}</span>); }
    if (f.enum) return (
      <select className="ne-select" value={v} onChange={e => { setVal(f.name, e.target.value); save({ props: { [f.name]: e.target.value || null } }); }}>
        {(v && !f.enum.includes(v) ? [v] : []).concat(['', ...f.enum]).map(o => <option key={o} value={o}>{o || 'Empty'}</option>)}
      </select>);
    if (f.type === 'bool') return <input type="checkbox" checked={/^(true|yes)$/i.test(v)} onChange={e => { setVal(f.name, e.target.checked ? 'true' : ''); save({ props: { [f.name]: e.target.checked ? 'true' : null } }); }} />;
    if (f.type === 'progress') return (
      <span className="ne-progress"><ProgressBar value={v ? Number(v) : computed} width={110} /><input className="ne-in ne-pct" value={v} placeholder={computed !== undefined ? `${computed}%` : '—'} onChange={e => setVal(f.name, e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={enterBlurs} onBlur={() => commit(f)} />{entry?.parts && <em className="muted">{entry.parts.done} of {entry.parts.total} parts done</em>}</span>);
    if (f.type === 'text') return <textarea className="ne-in ne-text" rows={Math.min(10, Math.max(1, Math.ceil(v.length / 55) + v.split('\n').length - 1))} value={v} placeholder="Empty" onChange={e => setVal(f.name, e.target.value)} onBlur={() => commit(f)} disabled={prose && f.from !== 'type:node'} title={prose && f.from !== 'type:node' ? 'a prose line holds single-line values; open the document for a long text' : ''} />;
    // a relation the text carries ("part of wf2.ui") reads as its tags too; the field only writes an explicit value
    const derived = f.ref && !v.trim() ? (relations.find(([verb]) => verb === f.name)?.[1] ?? []) : [];
    if (f.ref && !f.many && f.ref !== 'node') {
      const opts = suggest(f);
      return (
        <span className={`ne-ref ${derived.length ? 'has-tags' : ''}`}>
          {derived.length > 0 && <span className="list">{derived.map(x => <span key={x} className="item"><SmartTag id={x} /></span>)}</span>}
          <select className="ne-select" value={v} onChange={e => { setVal(f.name, e.target.value); save({ props: { [f.name]: e.target.value || null } }); }}>
            <option value="">Empty</option>
            {v && !opts.some(o => o.id === v) && <option value={v}>{v}</option>}
            {opts.map(o => <option key={o.id} value={o.id}>{o.id.slice(o.id.indexOf(':') + 1)} — {plain(o.title).slice(0, 50)}</option>)}
          </select>
          {v && /^[a-z][a-z0-9-]*:/.test(v) && <SmartTag id={v} />}
        </span>);
    }
    // many of a type (decision:ontology.one-of-many-of): the linked ones as tags, each with its ×, and a picker of the
    // rest of that type to add one — the raw field is not needed
    if (f.ref && f.many && f.ref !== 'node') {
      const on = v.trim() ? listOf(v).filter(x => /^[a-z][a-z0-9-]*:/.test(x)) : derived;
      const rest = suggest(f).filter(o => !on.includes(o.id));
      return (
        <span className="ne-ref has-tags ne-many">
          <span className="list">{on.map(x => <span key={x} className="item"><SmartTag id={x} /><button type="button" className="ne-unlink" title="remove" onClick={() => writeList(on.filter(y => y !== x))}>×</button></span>)}</span>
          <select className="ne-select ne-add" value="" onChange={e => { if (e.target.value) writeList([...on, e.target.value]); }}>
            <option value="">{on.length ? '+ add' : `+ ${f.ref}`}</option>
            {rest.map(o => <option key={o.id} value={o.id}>{o.id.slice(o.id.indexOf(':') + 1)} — {plain(o.title).slice(0, 50)}</option>)}
          </select>
        </span>);
    }
    // a relation reads as its tags, each with its × (the ones the text carries — "part of wf2.ui" — have none: they
    // are the sentence's); + opens a picker in the same row to add one. Nothing appears on hover, nothing moves.
    const explicit = f.ref && v.trim() ? v.replace(/^\[|\]$/g, '').split(/,\s*/).filter(x => /^[a-z][a-z0-9-]*:/.test(x)) : [];
    const tagIds = explicit.length ? explicit : derived;
    // a source path (`source: packages/web/src/lib/x.ts#fn`) opens the file in the column (req:wf2.code-preview)
    const files = !f.ref && (CODE_KEYS.has(f.name) || /\.(ts|tsx|js|py|go|rs|java)\b/.test(v)) ? codePaths(v) : [];
    if (f.ref) {
      const adding = addingFor === f.name;
      const addOne = (raw: string) => { const idv = raw.trim(); setAddingFor(null); setAddText(''); if (!idv || !/^[a-z][a-z0-9-]*:/.test(idv) || explicit.includes(idv)) return; writeList([...explicit, idv]); };
      return (
        <span className="ne-ref has-tags ne-many">
          <span className="list">
            {tagIds.map(x => <span key={x} className="item"><SmartTag id={x} />{explicit.includes(x) && <button type="button" className="ne-unlink" title="remove" onClick={() => writeList(explicit.filter(y => y !== x))}>×</button>}</span>)}
            {adding
              ? <input autoFocus className="ne-in ne-add-in" list={`wf-ref-${f.ref}`} value={addText} placeholder={f.ref === 'node' ? 'kind:slug' : `${f.ref}:…`} onChange={e => setAddText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOne(addText); } if (e.key === 'Escape') { setAddingFor(null); setAddText(''); } }} onBlur={() => addOne(addText)} aria-label={`add ${f.name}`} />
              : <button type="button" className="ne-add-btn" title={`add a ${f.ref === 'node' ? 'node' : f.ref}`} onClick={() => { setAddingFor(f.name); setAddText(''); }}>+</button>}
          </span>
          <datalist id={`wf-ref-${f.ref}`}>{(f.ref === 'node' ? Object.values(index).filter(e => e.defined && e.id !== id && !['block', 'field', 'prop'].includes(e.kind)).slice(0, 2000) : suggest(f)).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</datalist>
        </span>);
    }
    return (
      <span className={`ne-ref ${files.length ? 'has-files' : ''}`}>
        {files.length > 0 && <span className="list">{files.map(x => <span key={x} className="item"><button type="button" className="code-link" title={`open ${x} in the column`} onClick={() => openNode(`code:${x}`)}>{'</>'} {x.split('/').pop()}</button></span>)}</span>}
        <input className="ne-in" value={v} placeholder="Empty" onChange={e => setVal(f.name, e.target.value)} onKeyDown={enterBlurs} onBlur={() => commit(f)} aria-label={f.name} />
      </span>);
  };
  return (
    <section className="ne" id={`n-${id}`}>
      <dl className="ne-props">
        <div><dt><i>◔</i>status</dt><dd>
          <select className={`ne-select status-sel s-${status}`} value={status} onChange={e => save({ status: e.target.value })}>
            {(statuses.includes(status) ? [] : [status]).concat(statuses).map(st => <option key={st} value={st}>{st || 'Empty'}</option>)}
          </select></dd></div>
        {shown.map(f => (
          <div key={f.name} className={isEmpty(f) ? 'empty' : ''}>
            <dt title={f.from === 'tracking' ? 'tracking field' : f.from && f.from !== 'type:node' ? (f.from === type?.id ? `declared on ${f.from}` : `inherited from ${f.from}`) : f.from ? 'the text' : 'a key this card carries'}><i>{glyph(f)}</i>{f.name}{f.required && !(vals[f.name] ?? '').trim() && <b className="bad" title="required">*</b>}</dt>
            <dd>{value(f)}</dd>
          </div>))}
        {/* a property the type does not declare (an open type, or a note the person wants on this node): name and value, written to the card */}
        <div className="ne-more ne-addprop"><dt /><dd>
          {addProp === null ? <button className="doc-ghost" onClick={() => setAddProp({ name: '', value: '' })}>+ Add a property</button>
            : <span className="ne-addprop-form">
              <input autoFocus className="ne-in" placeholder="name" value={addProp.name} onChange={e => setAddProp({ ...addProp, name: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} onKeyDown={e => { if (e.key === 'Escape') setAddProp(null); }} />
              <input className="ne-in" placeholder="value" value={addProp.value} onChange={e => setAddProp({ ...addProp, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && addProp.name) { save({ props: { [addProp.name]: addProp.value } }); setAddProp(null); } if (e.key === 'Escape') setAddProp(null); }} />
              <button className="pri" disabled={!addProp.name} onClick={() => { save({ props: { [addProp.name]: addProp.value } }); setAddProp(null); }}>Add</button>
            </span>}
        </dd></div>
        {hidden.length > 0 && <div className="ne-more"><dt /><dd><button className="linkish" onClick={() => setMore(m => !m)}>{more ? '▾ hide empty properties' : `▸ ${hidden.length} more propert${hidden.length === 1 ? 'y' : 'ies'}`}</button></dd></div>}
      </dl>
      {state !== 'idle' && <p className={`track-state ${state}`} role="status">{state === 'saving' ? 'Saving…' : state === 'saved' ? `Saved to ${prose ? 'the line' : 'the card'} in the document` : `Could not save: ${msg}`}</p>}
    </section>
  );
}
const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); };
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
