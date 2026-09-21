'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TypeDef } from '@/lib/graph';
import type { IndexEntry } from '@/lib/doc';
import type { OwnProp } from '@/lib/type-edit';
import { SmartTag } from './SmartTag';
import { KindPill, StatusPill } from './Pills';

// The value type of a property as a choice (decision:ontology.one-of-many-of): a scalar, one of / many of a type
// (a link, with an inverse), one of / many of a list of values (a select / a multi-select). Read from and written
// back as the spec string the parser takes.
type Shape = { kind: 'string' | 'text' | 'number' | 'date' | 'month' | 'bool' | 'oneType' | 'manyType' | 'oneValue' | 'manyValue' | 'list of string'; arg: string };
const SCALARS = ['string', 'text', 'number', 'date', 'month', 'bool', 'list of string'];
function shapeOf(spec: string): Shape {
  let m: RegExpMatchArray | null;
  if ((m = spec.match(/^ref (.+)$/))) return { kind: 'oneType', arg: m[1].trim() };
  if ((m = spec.match(/^list of (.+)$/)) && m[1].trim() !== 'string') return { kind: 'manyType', arg: m[1].trim() };
  if ((m = spec.match(/^enum\s*\[(.*)\]$/))) return { kind: 'oneValue', arg: m[1].trim() };
  if ((m = spec.match(/^manyOf\s*\[(.*)\]$/))) return { kind: 'manyValue', arg: m[1].trim() };
  if ((m = spec.match(/^oneOf\s*\[(.*)\]$/))) return { kind: 'oneValue', arg: m[1].trim() };
  return { kind: (SCALARS.includes(spec) ? spec : 'string') as Shape['kind'], arg: '' };
}
const specOf = (sh: Shape): string => sh.kind === 'oneType' ? `ref ${sh.arg || 'node'}` : sh.kind === 'manyType' ? `list of ${sh.arg || 'node'}` : sh.kind === 'oneValue' ? `enum [${sh.arg}]` : sh.kind === 'manyValue' ? `manyOf [${sh.arg}]` : sh.kind;
const KINDS: { kind: Shape['kind']; label: string }[] = [{ kind: 'string', label: 'string' }, { kind: 'text', label: 'text' }, { kind: 'number', label: 'number' }, { kind: 'date', label: 'date' }, { kind: 'month', label: 'month' }, { kind: 'bool', label: 'yes / no' }, { kind: 'oneType', label: 'one of type →' }, { kind: 'manyType', label: 'many of type →' }, { kind: 'oneValue', label: 'one of values' }, { kind: 'manyValue', label: 'many of values' }, { kind: 'list of string', label: 'list of strings' }];
function ValueType({ spec, types, readOnly, onChange }: { spec: string; types: string[]; readOnly: boolean; onChange: (spec: string) => void }) {
  const sh = shapeOf(spec);
  const set = (patch: Partial<Shape>) => onChange(specOf({ ...sh, ...patch }));
  if (readOnly) return <code>{spec}</code>;
  return (
    <span className="vt">
      <select value={sh.kind} onChange={e => { const kind = e.target.value as Shape['kind']; set({ kind, arg: kind === 'oneType' || kind === 'manyType' ? (types.includes(sh.arg) ? sh.arg : types[0] ?? 'node') : kind === 'oneValue' || kind === 'manyValue' ? sh.arg : '' }); }}>{KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>
      {(sh.kind === 'oneType' || sh.kind === 'manyType') && <select value={sh.arg} onChange={e => set({ arg: e.target.value })} title="the type it links to">{[...new Set(['node', ...types, sh.arg].filter(Boolean))].map(t => <option key={t} value={t}>{t}</option>)}</select>}
      {(sh.kind === 'oneValue' || sh.kind === 'manyValue') && <input value={sh.arg} placeholder="value, value, value" onChange={e => set({ arg: e.target.value })} title="the values, comma-separated" />}
    </span>
  );
}
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// A type in the context column: its card (purpose, extends, open), its own properties as an editable table, the
// inherited ones greyed with their declaring type, then every instance — the "connected" list of a type.
export function TypeView({ type, instances, index, product, onSaved }: { type: TypeDef; instances: { id: string; title: string; status: string }[]; index: Record<string, IndexEntry>; product: string; onSaved: () => void }) {
  const base = !type.file || type.file.startsWith('schema/');
  const own = type.props.filter(p => p.from === type.id), inherited = type.props.filter(p => p.from !== type.id && p.from !== 'type:node');
  const toOwn = (): OwnProp[] => own.map(p => ({ name: p.name, type: p.type, required: p.required, inverse: p.inverse ?? '' }));
  const [rows, setRows] = useState<OwnProp[]>(toOwn);
  const [purpose, setPurpose] = useState(type.purpose);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setRows(toOwn()); setPurpose(type.purpose); setDirty(false); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (i: number, patch: Partial<OwnProp>) => { setRows(r => r.map((p, k) => k === i ? { ...p, ...patch } : p)); setDirty(true); };
  const save = async () => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/${product}/types/${type.slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ props: rows, scalars: purpose !== type.purpose ? { purpose } : {} }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).message ?? 'could not save'); return; }
    setDirty(false); onSaved();
  };
  const sub = (t: TypeDef['props'][number]) => t.ref ? `${t.many ? 'many of' : 'one of'} ${t.ref}` : t.enum ? `${t.many ? 'many of' : 'one of'} [${t.enum.join(', ')}]` : t.type;
  // the types a link may point at: every type the product knows (base and own), by slug
  const typeSlugs = Object.values(index).filter(e => e.kind === 'type' && e.defined).map(e => e.id.slice(5)).sort();
  return (
    <>
      <article className="card type-card" id={`n-${type.id}`}>
        <header><KindPill kind="type" />{type.open && <span className="pill">open</span>}<code className="cid">{type.id}</code></header>
        {base ? <p className="para">{type.purpose || <span className="muted">a base type</span>}</p>
          : <p className="para"><span className="pk">purpose</span> <input className="inline" value={purpose} placeholder="what instances of this type are" onChange={e => { setPurpose(e.target.value); setDirty(true); }} /></p>}
        <dl className="strip">
          <div><dt>extends</dt><dd>{type.extends ? <SmartTag id={type.extends} label={type.extends.slice(5)} /> : <span className="muted">— (root)</span>}</dd></div>
          {type.chain.length > 2 && <div><dt>chain</dt><dd className="muted">{type.chain.slice(1).map(c => c.slice(5)).join(' › ')}</dd></div>}
          {type.file && <div><dt>declared in</dt><dd className="muted">{base ? 'schema/base-ontology.md' : type.file.split('/').pop()}</dd></div>}
        </dl>
      </article>

      <section className="props">
        <h4>Properties <span className="muted">{own.length}{inherited.length ? ` + ${inherited.length} inherited` : ''}</span></h4>
        <table className="prop-edit">
          <thead><tr><th>name</th><th>value type</th><th title="required">req</th><th>inverse</th><th /></tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} readOnly={base} placeholder="name" onChange={e => edit(i, { name: e.target.value })} /></td>
                <td><ValueType spec={p.type} types={typeSlugs} readOnly={base} onChange={t => edit(i, { type: t })} /></td>
                <td><input type="checkbox" checked={p.required} disabled={base} onChange={e => edit(i, { required: e.target.checked })} /></td>
                <td><input value={p.inverse} readOnly={base} placeholder={/^(ref|list of) [a-z]/.test(p.type) && !/^list of string$/.test(p.type) ? `${p.name || 'name'}-of` : ''} disabled={!/^(ref|list of) [a-z]/.test(p.type) || /^list of (string|number|date)$/.test(p.type)} onChange={e => edit(i, { inverse: e.target.value })} /></td>
                <td>{!base && <button className="x" title="Remove property" onClick={() => { setRows(r => r.filter((_, k) => k !== i)); setDirty(true); }}>×</button>}</td>
              </tr>))}
            {inherited.map(p => (
              <tr key={p.from + p.name} className="inherited" title={`inherited from ${p.from}`}>
                <td><code>{p.name}</code></td><td>{sub(p)}</td><td>{p.required ? '✓' : ''}</td><td>{p.inverse ?? ''}</td><td><Link href={`/${product}/types/${p.from.slice(5)}`} className="muted">{p.from.slice(5)}</Link></td>
              </tr>))}
          </tbody>
        </table>
        {!base && (
          <div className="prop-edit-bar">
            <button className="linkish" onClick={() => { setRows(r => [...r, { name: '', type: 'string', required: false, inverse: '' }]); setDirty(true); }}>+ property</button>
            {dirty && <button className="save" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save to document'}</button>}
            {dirty && <button className="linkish" onClick={() => { setRows(toOwn()); setPurpose(type.purpose); setDirty(false); }}>Discard</button>}
            {err && <span className="bad">{err}</span>}
          </div>)}
        <p className="muted small">…and what every node has: title, status, owner, text and the generic links. <Link href={`/${product}/types/${type.slug}`}>Open type page →</Link></p>
      </section>
      {(type.shapes ?? []).length > 0 && (
        <section className="props">
          <h4>Shapes <span className="muted">what <code>ctx check</code> enforces on a {type.slug}</span></h4>
          <ul className="shape-list">{(type.shapes ?? []).map((sh, i) => <li key={i}><code>{sh.text}</code>{sh.from !== type.id && <span className="muted"> · from <Link href={`/${product}/types/${sh.from.slice(5)}`}>{sh.from.slice(5)}</Link></span>}</li>)}</ul>
        </section>)}

      <div className="peek-views"><h4>Instances <span className="muted">{instances.length}</span></h4></div>
      {instances.length ? (
        <div className="rels"><section><ul>
          {instances.map(n => { const e = index[n.id]; return <li key={n.id}><SmartTag id={n.id} />{(n.status || e?.status) && <StatusPill status={n.status || e?.status || ''} />}<span className="rt">{n.title && n.title !== n.id && !n.id.endsWith(':' + n.title) ? plain(n.title) : ''}</span></li>; })}
        </ul></section></div>
      ) : <p className="muted rels-empty">No instances yet — write <code>{type.slug}:&lt;slug&gt;</code> as a card or a prose line, or use + add on the type page.</p>}
    </>
  );
}
