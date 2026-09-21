'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PropDef, TypeDef } from '@/lib/graph';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { Cover, IconPicker, PageComments, TagsRow } from './PageHead';

const STATUSES = ['proposed', 'partial', 'shipped', 'deprecated'];
// frontmatter keys the header shows in its own places (or never): not properties of the type
const HEAD_KEYS = new Set(['node', 'type', 'title', 'status', 'icon', 'cover', 'tags', 'owner', 'last-verified', 'order', 'sources', 'source-roots', 'text', 'part-of']);
const glyph = (p: PropDef) => p.ref ? '↗' : p.type === 'text' ? '≡' : p.type === 'date' || p.type === 'month' ? '▦' : p.type === 'bool' ? '☑' : p.enum ? '◇' : p.type === 'number' ? '#' : '⋯';
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// The document header is the page node's card (req:wf2.page.header-card, rule:page-node-line): a type picker in
// place of a fixed "document" pill (the product's own types first, then the base types — picking one retypes the
// page and every link to it, op:doc.retype), the id, the status, the icon and the title, then the type's effective
// properties as editable fields (the root type's folded unless filled); a field saves to the frontmatter when it
// loses focus (op:doc.frontmatter). An unknown type shows the plain fields and a warning.
export function DocProps({ product, project, slug, file, fm, node, types }: { product: string; project: string; slug: string; file: string; fm: Record<string, string>; node: string; types: TypeDef[] }) {
  const router = useRouter();
  const { index, open } = usePeek();
  const [vals, setVals] = useState<Record<string, string>>(fm);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [more, setMore] = useState(false);
  const [iconPick, setIconPick] = useState(false);
  useEffect(() => { setVals(fm); }, [fm]);
  const kind = node.split(':')[0];
  const type = types.find(t => t.slug === kind) ?? null;
  const isBase = (t: TypeDef) => !t.file || t.file.startsWith('schema/');
  const choices = [...types.filter(t => !isBase(t)), ...types.filter(t => isBase(t))].filter(t => t.slug !== 'node');
  async function commit(key: string, explicit?: string) {
    const cur = explicit ?? vals[key] ?? '';
    if (cur === (fm[key] ?? '')) return;
    setState('saving'); setMsg('');
    const v = cur.trim();
    const r = await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { [key]: v || (HEAD_KEYS.has(key) ? '' : null) } }) });
    setState(r.ok ? 'saved' : 'error'); router.refresh();
  }
  async function retype(to: string) {
    if (!to || to === kind) return;
    setState('saving'); setMsg('');
    const r = await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'retype', type: to }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setState('error'); setMsg(j.message ?? j.error ?? 'could not change the type'); return; }
    setState('saved'); setMsg(j.rewritten ? `${j.rewritten} link${j.rewritten === 1 ? '' : 's'} in ${j.files} page${j.files === 1 ? '' : 's'} now point at ${j.node}` : ''); router.refresh();
  }
  const enterBlurs = (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); };
  const field = (key: string, cls = '') => <input className={`prop-in ${cls}`} value={vals[key] ?? ''} placeholder={key === 'icon' ? '📄' : key} onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))} onBlur={() => commit(key)} onKeyDown={enterBlurs} />;
  // the type's properties as fields: own and inherited first; the root type's only when filled or unfolded
  const props = (type?.props ?? []).filter(p => !HEAD_KEYS.has(p.name));
  const filled = (p: PropDef) => !!(vals[p.name] ?? '').trim();
  // only the properties that hold a value show; every empty one — own, inherited, the root type's — sits under "n more"
  // until asked (decision:wf2.card-is-name-and-properties): a page's head is what was written, not the type's form
  const shown = props.filter(p => filled(p) || more);
  const folded = props.filter(p => !filled(p)).length;
  const suggest = (p: PropDef) => p.ref && p.ref !== 'node' ? Object.values(index).filter(e => e.defined && e.kind === p.ref && e.id !== node).sort((a, b) => a.id.localeCompare(b.id)) : [];
  const value = (p: PropDef) => {
    const v = vals[p.name] ?? '';
    const set = (x: string) => setVals(c => ({ ...c, [p.name]: x }));
    // many of values (decision:ontology.one-of-many-of): every value as a toggle; the frontmatter takes the list
    if (p.enum && p.many) { const on = v.replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean); const write = (items: string[]) => { const next = items.length ? `[${items.join(', ')}]` : ''; setVals(c => ({ ...c, [p.name]: next })); commit(p.name, next); };
      return <span className="ne-multi">{[...new Set([...p.enum, ...on])].map(o => <button key={o} type="button" className={`ne-toggle ${on.includes(o) ? 'on' : ''}`} aria-pressed={on.includes(o)} onClick={() => write(on.includes(o) ? on.filter(x => x !== o) : [...on, o])}>{o}</button>)}</span>; }
    if (p.enum) return <select className="ne-select" value={v} onChange={e => { set(e.target.value); }} onBlur={() => commit(p.name)}>{(v && !p.enum.includes(v) ? [v] : []).concat(['', ...p.enum]).map(o => <option key={o} value={o}>{o || 'Empty'}</option>)}</select>;
    if (p.type === 'bool') return <input type="checkbox" checked={/^(true|yes)$/i.test(v)} onChange={e => { set(e.target.checked ? 'true' : ''); }} onBlur={() => commit(p.name)} />;
    // a plan's `session` (type:plan): the conversation(s) that did the work, each opening in the context column
    if (p.name === 'session' && v.trim()) return (
      <span className="ne-ref">
        <input className="ne-in" value={v} placeholder="session id" onChange={e => set(e.target.value)} onKeyDown={enterBlurs} onBlur={() => commit(p.name)} />
        <span className="list">{v.split(/\s+/).filter(Boolean).map(id => <span key={id} className="item"><button type="button" className="linkish" title={`open session ${id}`} onClick={() => open(`session:${id}`)}>session {id.slice(0, 6)}</button></span>)}</span>
      </span>);
    if (p.type === 'text') return <textarea className="ne-in ne-text" rows={Math.min(8, Math.max(1, Math.ceil(v.length / 70) + v.split('\n').length - 1))} value={v} placeholder={p.type} onChange={e => set(e.target.value)} onBlur={() => commit(p.name)} />;
    if (p.ref && !p.many && p.ref !== 'node') {
      const opts = suggest(p);
      return (
        <span className="ne-ref">
          <select className="ne-select" value={v} onChange={e => set(e.target.value)} onBlur={() => commit(p.name)}>
            <option value="">Empty</option>
            {v && !opts.some(o => o.id === v) && <option value={v}>{v}</option>}
            {opts.map(o => <option key={o.id} value={o.id}>{o.id.slice(o.id.indexOf(':') + 1)} — {plain(o.title).slice(0, 50)}</option>)}
          </select>
          {v && /^[a-z][a-z0-9-]*:/.test(v) && <SmartTag id={v} />}
        </span>);
    }
    return (
      <span className="ne-ref">
        <input className="ne-in" list={p.ref ? `wf-doc-ref-${p.ref}` : undefined} value={v} placeholder={p.ref ? `${p.many ? 'list of ' : ''}${p.ref}` : p.type} onChange={e => set(e.target.value)} onKeyDown={enterBlurs} onBlur={() => commit(p.name)} />
        {p.ref && <datalist id={`wf-doc-ref-${p.ref}`}>{suggest(p).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</datalist>}
        {p.ref && v.trim() && <span className="list">{v.replace(/^\[|\]$/g, '').split(/,\s*/).filter(x => /^[a-z][a-z0-9-]*:/.test(x)).map(x => <span key={x} className="item"><SmartTag id={x} /></span>)}</span>}
      </span>);
  };
  // a key set from a control (icon, cover, tags): the state and the front matter in one move
  const setKey = (key: string, v: string) => { setVals(c => ({ ...c, [key]: v })); void commit(key, v); };
  const tagsProp = (type?.props ?? []).find(p => p.name === 'tags') ?? null;
  return (
    <header className={`doc-head ${vals.cover ? 'has-cover' : ''}`}>
      {vals.cover && <Cover product={product} project={project} value={vals.cover} onChange={v => setKey('cover', v)} />}
      {vals.icon && <div className="doc-icon-row"><button type="button" className="doc-icon-big" onClick={() => setIconPick(v => !v)} title="Change the icon">{vals.icon}</button>{iconPick && <IconPicker value={vals.icon} onPick={v => { setKey('icon', v); setIconPick(false); }} onClose={() => setIconPick(false)} />}</div>}
      <div className="doc-ghost-row">
        {!vals.icon && <><button type="button" className="doc-ghost" onClick={() => setIconPick(v => !v)}>☺ Add icon</button>{iconPick && <IconPicker value="" onPick={v => { setKey('icon', v); setIconPick(false); }} onClose={() => setIconPick(false)} />}</>}
        {!vals.cover && <Cover product={product} project={project} value="" onChange={v => setKey('cover', v)} />}
      </div>
      <div className="pills">
        <select className={`pill k type-sel k-${kind}`} style={{ background: `var(--k-${kind}, var(--k-module))` }} value={kind} onChange={e => retype(e.target.value)} title={type ? `${type.purpose || type.id} — pick another type to retype the page and every link to it` : `${kind} is not a declared type`}>
          {!type && <option value={kind}>{kind}</option>}
          {choices.map(t => <option key={t.slug} value={t.slug}>{t.slug}</option>)}
        </select>
        <code className="cid doc-id" title="the page's node">{node}</code>
        <select className="status-sel" value={vals.status ?? ''} onChange={e => { setVals(v => ({ ...v, status: e.target.value })); }} onBlur={() => commit('status')}>{[vals.status ?? '', ...STATUSES].filter((v, i, a) => a.indexOf(v) === i).map(v => <option key={v} value={v}>{v || '—'}</option>)}</select>
        <span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'error' ? 'save failed' : ''}</span>
        {msg && <span className={`muted doc-msg ${state === 'error' ? 'bad' : ''}`}>{msg}</span>}
        {!type && <span className="doc-warn">unknown type — the page is not in the graph</span>}
      </div>
      <div className="doc-title-row">{field('title', 'h1')}</div>
      <dl className="ne-props doc-props">
        <div><dt><i>◔</i>owner</dt><dd>{field('owner')}</dd></div>
        <div className={vals.tags ? '' : 'empty'}><dt title={tagsProp?.enum ? `values defined on ${tagsProp.from}` : 'free labels; a type may define them'}><i>⌗</i>tags</dt><dd><TagsRow product={product} type={type} prop={tagsProp} value={vals.tags ?? ''} onChange={v => setKey('tags', v)} /></dd></div>
        <div className="empty"><dt><i>▦</i>verified</dt><dd>{field('last-verified')}</dd></div>
        {more && <div className="empty"><dt><i>⋯</i>file</dt><dd><code className="muted">{file}</code></dd></div>}
      </dl>
      {(shown.length > 0 || folded > 0) && (
        <dl className="ne-props doc-props">
          {shown.map(p => (
            <div key={p.name} className={filled(p) ? '' : 'empty'}>
              <dt title={p.from === type?.id ? `declared on ${p.from}` : `inherited from ${p.from}`}><i>{glyph(p)}</i>{p.name}{p.required && !filled(p) && <b className="bad" title="required">*</b>}</dt>
              <dd>{value(p)}</dd>
            </div>
          ))}
          {folded > 0 && <div><dt /><dd><button className="linkish doc-more" onClick={() => setMore(m => !m)}>{more ? '⌃ fewer properties' : `⌄ ${folded} more properties`}</button></dd></div>}
        </dl>
      )}
      <PageComments product={product} node={node} />
    </header>
  );
}
