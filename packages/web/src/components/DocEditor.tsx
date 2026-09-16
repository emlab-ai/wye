'use client';
import { useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { useCreateBlockNote, createReactInlineContentSpec, createReactBlockSpec, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems, SuggestionMenuController, getDefaultReactSlashMenuItems, useBlockNoteEditor, useComponentsContext, SideMenuController, SideMenu, DragHandleMenu, RemoveBlockItem, BlockColorsItem, useExtensionState, useEditorSelectionChange, useEditorChange } from '@blocknote/react';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { prepare, expand } from '@/lib/import';
import { blocksToMarkdown, type AnyBlock } from '@/lib/serialize';
import { CARD_KINDS } from '@/lib/kinds';
import { parseBody } from '@/lib/graph';
import { Linkified } from './IdLink';
import { SmartTag } from './SmartTag';
import { DrawingBlock, newDrawingSlug, sceneFromText } from './DrawingBlock';
import { usePeek } from './PeekProvider';
import { ID_RE } from '@/lib/ids';
import { parseExtra, withExtra, GOAL_STATUSES, TASK_STATUSES } from '@/lib/props';
import { slugify } from '@/lib/templates';
import { ProgressBar } from './Progress';
import { requestSend } from './SendToAgent';

const STATUSES = ['', 'proposed', 'approved', 'unverified', 'api-only', 'shipped', 'deprecated', 'question', 'open', 'in-progress', 'blocked', 'done', 'non-goal', 'draft', 'active', 'complete', 'on-track', 'at-risk', 'off-track', 'paused'];

// kind:slug as inline content: a clickable tag in the editor, plain id text when serialised.
const Tag = createReactInlineContentSpec(
  { type: 'tag', propSchema: { id: { default: '' } }, content: 'none' },
  { render: props => <SmartTag id={props.inlineContent.props.id} />, toExternalHTML: props => <span>{props.inlineContent.props.id}</span> },
);

// A yaml flow list "[a, b]" renders as its items; anything else as linkified text.
function PropValue({ value }: { value: string }) {
  const m = value.match(/^\[(.*)\]$/s);
  if (!m) return <Linkified text={value} />;
  const items = m[1].split(/,\s*(?![^()]*\))/).map(x => x.trim()).filter(Boolean);
  if (!items.length) return <span className="muted">none</span>;
  return <span className="list">{items.map((it, i) => <span key={i} className="item"><Linkified text={it} /></span>)}</span>;
}

// ProseMirror listens natively on the editor root and would treat a click on a header control as a node selection;
// stop mouse and key events at the header so inputs, selects and checkboxes behave normally.
function stopEditorEvents(el: HTMLElement | null) {
  if (!el || (el as unknown as { __stopped?: boolean }).__stopped) return;
  (el as unknown as { __stopped?: boolean }).__stopped = true;
  for (const ev of ['mousedown', 'keydown']) el.addEventListener(ev, e => e.stopPropagation()); // click and change still reach React
}

// Send a block to an agent: its plain text, the ids it defines or links, and where it lives.
function sendBlock(block: AnyBlock, host: HTMLElement | null) {
  const doc = host?.closest('.doc-editor') as HTMLElement | null;
  const items = Array.isArray(block.content) ? block.content as { type: string; text?: string; props?: { id?: string }; href?: string; content?: { text?: string }[] }[] : [];
  const text = items.map(i => i.type === 'text' ? i.text ?? '' : i.type === 'link' ? (i.content ?? []).map(c => c.text ?? '').join('') : i.type === 'tag' ? i.props?.id ?? '' : '').join('');
  const refs = items.flatMap(i => i.type === 'tag' && i.props?.id ? [i.props.id] : i.type === 'link' && i.href && /^[a-z-]+:/.test(i.href) ? [i.href] : []);
  if (block.type === 'node') { const np = block.props as unknown as { kind: string; slug: string }; refs.unshift(`${np.kind}:${np.slug}`); }
  requestSend({ text, refs, source: { project: doc?.dataset.project, doc: doc?.dataset.doc, blockId: String((block as { id?: string }).id ?? '') } });
}

// Drag-handle menu entry on every block: send it to an agent.
function SendToAgentItem() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: st => st?.block });
  if (!block) return null;
  return <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => sendBlock(block as unknown as AnyBlock, editor.domElement as HTMLElement | null)}>Send to agent</Components.Generic.Menu.Item>;
}

// A goal or task shown as a table row inside a goals/tasks collection: name (editable inline content), status, target,
// progress, owner. Tracking fields live in the node's trailing property group.
function RowNode({ p, set, contentRef, block }: { p: { kind: string; slug: string; status: string; extra: string; check: string; row: string }; set: (patch: Partial<typeof p>) => void; contentRef: (el: HTMLElement | null) => void; block: AnyBlock }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { index } = usePeek();
  const id = `${p.kind}:${p.slug}`; const e = index[id];
  const empty = !p.slug && !rowText(block);
  const ex = parseExtra(p.extra);
  const statuses = p.kind === 'goal' ? GOAL_STATUSES : TASK_STATUSES;
  const done = p.check === 'done' || p.status === 'done' || p.status === 'complete';
  const explicit = ex.progress ? Number(ex.progress) : undefined;
  const progress = explicit ?? (done ? 100 : e?.progress);
  const setStatus = (st: string) => set(p.kind === 'task' ? { status: st, check: st === 'done' ? 'done' : 'todo' } : { status: st });
  return (
    <div className={`nrow k-${p.kind} ${done ? 'done' : ''} ${empty ? 'empty' : ''}`} data-id={id} ref={rowRef}>
      <div className="nrow-cell nrow-name">
        {p.kind === 'task' && <input type="checkbox" className="nblock-check" checked={done} onChange={ev => setStatus(ev.target.checked ? 'done' : 'todo')} title="done?" onMouseDown={ev => ev.stopPropagation()} />}
        <button type="button" className="nrow-open" contentEditable={false} title={id} onMouseDown={ev => ev.stopPropagation()} onClick={() => window.dispatchEvent(new CustomEvent('wf:peek', { detail: id }))}><i style={{ background: `var(--k-${p.kind}, var(--k-other))` }} /></button>
        <div className="nrow-text" ref={contentRef} data-placeholder={`New ${p.kind}…`} />
        <button type="button" className="nrow-send" contentEditable={false} title="Send to agent" onMouseDown={ev => ev.stopPropagation()} onClick={() => sendBlock(block, rowRef.current)}>⇢</button>
      </div>
      <div className="nrow-cell" contentEditable={false} ref={stopEditorEvents}>
        <select className={`status-sel s-${p.status}`} value={p.status} onChange={ev => setStatus(ev.target.value)}>
          {(statuses.includes(p.status) || !p.status ? [] : [p.status]).concat(['', ...statuses]).map(st => <option key={st} value={st}>{st || '— status'}</option>)}
        </select>
      </div>
      <div className="nrow-cell" contentEditable={false} ref={stopEditorEvents}>
        <input className="nrow-in" value={ex.target ?? ex.due ?? ''} placeholder={p.kind === 'goal' ? 'target' : 'due'} title="target date or month" onChange={ev => set({ extra: withExtra(p.extra, p.kind === 'goal' ? 'target' : 'due', ev.target.value) })} />
      </div>
      <div className="nrow-cell nrow-progress" contentEditable={false} ref={stopEditorEvents} title={explicit !== undefined ? 'explicit progress — clear to compute from parts' : e?.parts ? `${e.parts.done} of ${e.parts.total} parts done` : 'no parts yet — type a percentage'}>
        <ProgressBar value={progress} width={52} />
        <input className="nrow-in nrow-pct" value={ex.progress ?? ''} placeholder={progress !== undefined ? `${progress}%` : '—'} onChange={ev => set({ extra: withExtra(p.extra, 'progress', ev.target.value.replace(/[^0-9]/g, '')) })} />
      </div>
      <div className="nrow-cell" contentEditable={false} ref={stopEditorEvents}>
        <input className="nrow-in" value={ex.owner ?? ''} placeholder="owner" onChange={ev => set({ extra: withExtra(p.extra, 'owner', ev.target.value) })} />
      </div>
    </div>
  );
}

// An empty row for a goals/tasks table: typing into it makes it a real item.
const emptyRow = (kind: string) => ({ type: 'node', props: { kind, slug: '', status: kind === 'goal' ? 'proposed' : 'open', form: 'prose', textKey: 'text', body: '', extra: '', check: kind === 'task' ? 'todo' : '', list: 'bullet', row: kind }, content: [] as unknown[] });
const rowText = (b: AnyBlock) => (Array.isArray(b.content) ? (b.content as { type: string; text?: string; props?: { id?: string } }[]).map(i => i.type === 'text' ? i.text ?? '' : i.type === 'tag' ? i.props?.id ?? '' : '').join('') : '').trim();

// Every goals/tasks table ends with one empty row; a row that gained text gets its id, and a new empty row follows.
// Returns true when blocks were changed.
function settleCollections(editor: { document: unknown; updateBlock: (b: unknown, u: unknown) => void }, taken: Set<string>, assignSlugs: boolean): boolean {
  let changed = false;
  for (const b of editor.document as AnyBlock[]) {
    if (b.type !== 'collection') continue;
    const kind = (b.props as { kind: string }).kind;
    const kids = [...(b.children ?? [])] as AnyBlock[];
    // ids for rows that have text but no slug yet
    for (const k of kids) {
      if (k.type !== 'node') continue;
      const p = k.props as unknown as { slug: string; kind: string };
      const text = rowText(k);
      if (assignSlugs && !p.slug && text) {
        let base = slugify(text.split(/\s+/).slice(0, 4).join(' ')) || kind; let slug = base; let n = 2;
        while (taken.has(`${kind}:${slug}`)) slug = `${base}-${n++}`;
        taken.add(`${kind}:${slug}`);
        k.props = { ...k.props, slug }; changed = true;
      }
    }
    // exactly one empty row, at the end (empty rows elsewhere are dropped)
    const filled = kids.filter(k => k.type !== 'node' || rowText(k) || (k.props as unknown as { slug: string }).slug === '' && k === kids[kids.length - 1]);
    const lastEmpty = filled.length && filled[filled.length - 1].type === 'node' && !rowText(filled[filled.length - 1]);
    const next = lastEmpty ? filled : [...filled, emptyRow(kind) as unknown as AnyBlock];
    if (changed || next.length !== kids.length || next.some((k, i) => k !== kids[i])) { editor.updateBlock(b, { children: next }); changed = true; }
  }
  return changed;
}

// A goals or tasks table: the header row; the rows are the block's children (goal/task nodes in row mode).
const CollectionBlock = createReactBlockSpec(
  { type: 'collection', propSchema: { kind: { default: 'goal' } }, content: 'none' },
  {
    render: props => {
      const kind = (props.block.props as { kind: string }).kind;
      return (
        <div className={`collection c-${kind}`} contentEditable={false} ref={stopEditorEvents}>
          <div className="nrow nrow-head">
            <div className="nrow-cell nrow-name">{kind === 'goal' ? 'Goals' : 'Tasks'}</div><div className="nrow-cell">Status</div><div className="nrow-cell">{kind === 'goal' ? 'Target' : 'Due'}</div><div className="nrow-cell nrow-progress">Progress</div><div className="nrow-cell">Owner</div>
          </div>
        </div>
      );
    },
  },
);

// A typed block (requirement, entity, rule, …): header with kind, id and status; the text is normal inline content.
const NodeBlock = createReactBlockSpec(
  { type: 'node', propSchema: { kind: { default: 'req' }, slug: { default: '' }, status: { default: '' }, form: { default: 'prose' }, textKey: { default: 'text' }, body: { default: '' }, extra: { default: '' }, check: { default: '' }, list: { default: '' }, row: { default: '' } }, content: 'inline' },
  {
    render: props => {
      const p = props.block.props as { kind: string; slug: string; status: string; form: string; body: string; extra: string; check: string; textKey: string; row: string };
      const [showYaml, setShowYaml] = useState(false);
      // every other key of a yaml node is shown read-only under the text; the yaml toggle edits them
      const rows = p.form === 'yaml' ? parseBody(p.body).filter(r => r.key !== p.textKey && r.key !== 'status') : [];
      const set = (patch: Partial<typeof p>) => props.editor.updateBlock(props.block, { props: { ...p, ...patch } } as never);
      if (p.row) return <RowNode p={p} set={set} contentRef={props.contentRef} block={props.block as unknown as AnyBlock} />;
      return (
        <div className={`nblock k-${p.kind} ${p.check === 'done' || p.status === 'done' ? 'done' : ''}`} data-id={`${p.kind}:${p.slug}`}>
          <div className="nblock-head" contentEditable={false} ref={stopEditorEvents}>
            {(p.check || p.kind === 'task') && (
              <input type="checkbox" className="nblock-check" checked={p.check === 'done' || p.status === 'done'} onChange={e => set({ check: e.target.checked ? 'done' : 'todo', status: e.target.checked ? 'done' : 'open' })} title="done?" />
            )}
            <button type="button" className="pill k nblock-peek" style={{ background: `var(--k-${p.kind}, var(--k-other))` }} title="Show everything connected to this node"
                    onClick={() => window.dispatchEvent(new CustomEvent('wf:peek', { detail: `${p.kind}:${p.slug}` }))}>{p.kind}</button>
            <input className="nblock-slug" value={p.slug} spellCheck={false} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />
            <select className="status-sel" value={p.status} onChange={e => set({ status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
            {p.form === 'yaml' && <button className="mini" onClick={() => setShowYaml(v => !v)}>{showYaml ? 'hide yaml' : 'yaml'}</button>}
            {p.form === 'prose' && <input className="nblock-extra" value={p.extra} placeholder="key: value, key: value" onChange={e => set({ extra: e.target.value })} />}
            <button type="button" className="nblock-send" title="Send this node to an agent" onClick={e => sendBlock(props.block as unknown as AnyBlock, e.currentTarget)}>⇢ agent</button>
          </div>
          <div className="nblock-text" ref={props.contentRef} />
          {rows.length > 0 && !showYaml && (
            <dl className="nblock-props" contentEditable={false} ref={stopEditorEvents}>
              {rows.map(r => (
                <div key={r.key}>
                  <dt>{r.key}</dt>
                  <dd>{r.value.includes('\n') ? <pre><Linkified text={r.value} /></pre> : <PropValue value={r.value} />}</dd>
                </div>
              ))}
            </dl>
          )}
          {showYaml && p.form === 'yaml' && <textarea className="nblock-yaml" contentEditable={false} value={p.body} rows={Math.min(24, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />}
        </div>
      );
    },
  },
);

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, node: NodeBlock(), drawing: DrawingBlock(), collection: CollectionBlock() }, inlineContentSpecs: { ...defaultInlineContentSpecs, tag: Tag } });

// Drag-handle menu entry on code blocks: turn an ASCII diagram into an editable drawing.
function ToDrawingItem({ convert }: { convert: (b: AnyBlock) => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: st => st?.block });
  if (!block || (block as { type: string }).type !== 'codeBlock') return null;
  return <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => convert(block as unknown as AnyBlock)}>Turn into drawing</Components.Generic.Menu.Item>;
}

// "Link to node": link the selected text to any node, searched by id or title. The selection range is captured
// when the picker opens (typing in the picker collapses the editor selection) and restored when the link is applied.
type LinkRequest = { from: number; to: number; text: string; x: number; y: number };
function LinkNodeButton({ onRequest }: { onRequest: (r: LinkRequest) => void }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  return (
    <Components.FormattingToolbar.Button className="bn-button" label="Link to node" mainTooltip="Link the selection to a node (⌁)" onClick={() => {
      const tt = (editor as unknown as { _tiptapEditor: { state: { selection: { from: number; to: number } } } })._tiptapEditor;
      const sel = window.getSelection(); const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { left: 200, bottom: 200 };
      onRequest({ from: tt.state.selection.from, to: tt.state.selection.to, text: editor.getSelectedText(), x: rect.left, y: rect.bottom + 6 });
    }}>⌁ node</Components.FormattingToolbar.Button>
  );
}

function LinkNodePicker({ req, onClose, apply, createDoc }: { req: LinkRequest; onClose: () => void; apply: (id: string) => void; createDoc: (title: string) => Promise<string | null> }) {
  const { index } = usePeek();
  const [q, setQ] = useState(req.text.trim());
  const [busy, setBusy] = useState(false);
  const hits = useMemo(() => { const n = q.trim().toLowerCase(); if (!n) return []; return Object.values(index).filter(e => e.id.toLowerCase().includes(n) || e.title.toLowerCase().includes(n)).slice(0, 8); }, [q, index]);
  const create = async () => { setBusy(true); const id = await createDoc(q.trim()); setBusy(false); if (id) apply(id); };
  return (
    <div className="linknode" style={{ left: Math.min(req.x, window.innerWidth - 360), top: req.y }}>
      <div className="linknode-sel">link “{req.text || '…'}” to</div>
      <input autoFocus value={q} placeholder="search id or title, or a new document title…" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { if (hits[0]) apply(hits[0].id); else if (q.trim()) create(); } if (e.key === 'Escape') onClose(); }} />
      <ul>
        {hits.map(h => <li key={h.id}><button onMouseDown={e => { e.preventDefault(); apply(h.id); }}><span>{h.id}</span><small>{h.title}</small></button></li>)}
        {q.trim() && <li><button className="create" disabled={busy} onMouseDown={e => { e.preventDefault(); create(); }}><span>+ new document “{q.trim()}”</span><small>creates a page under this one and links to it</small></button></li>}
      </ul>
    </div>
  );
}

export default function DocEditor({ product, project, slug, body, ifMatch, fallback }: { product: string; project: string; slug: string; body: string; ifMatch: string; fallback?: ReactNode }) {
  const router = useRouter();
  const { open: openPeek, index, hrefFor, setEditing, setShowContext } = usePeek();
  // node blocks render inside the editor, so they ask for the peek panel through a window event
  useEffect(() => { const h = (e: Event) => openPeek((e as CustomEvent<string>).detail); window.addEventListener('wf:peek', h); return () => window.removeEventListener('wf:peek', h); }, [openPeek]);
  const editor = useCreateBlockNote({ schema });
  if (typeof window !== 'undefined') { const w = window as unknown as { __wf: unknown; __wfExport: () => string }; w.__wf = editor; w.__wfExport = () => blocksToMarkdown(editor.document as unknown as AnyBlock[]); } // dev inspection
  void index;
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const [lintMsg, setLintMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkReq, setLinkReq] = useState<LinkRequest | null>(null);
  const hash = useRef(ifMatch);
  const lastExported = useRef<string | null>(null);
  const loading = useRef(false);
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useMemo(() => (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), []);

  // Publish the block under the cursor (its plain text and the ids it already carries) as the editing context for
  // the Context panel; the insert callback drops a tag at the current cursor position.
  const lastBlockId = useRef<string>('');
  const publishContext = () => {
    if (loading.current) return;
    let block: AnyBlock | undefined;
    try { block = editor.getTextCursorPosition().block as unknown as AnyBlock; } catch { block = undefined; }
    const bid = String((block as { id?: string } | undefined)?.id ?? '');
    if (bid !== lastBlockId.current) { lastBlockId.current = bid; if (touched.current && !loading.current && settle(true)) changed(); }
    if (!block || !Array.isArray(block.content)) { setEditing(null); return; }
    const items = block.content as { type: string; text?: string; props?: { id?: string }; href?: string; content?: { text?: string }[] }[];
    const text = items.map(i => i.type === 'text' ? i.text ?? '' : i.type === 'link' ? (i.content ?? []).map(c => c.text ?? '').join('') : '').join('');
    const linked = items.flatMap(i => i.type === 'tag' && i.props?.id ? [i.props.id] : i.type === 'link' && i.href && /^[a-z-]+:/.test(i.href) ? [i.href] : []);
    const np = block.type === 'node' ? block.props as unknown as { kind: string; slug: string } : null;
    if (np) linked.push(`${np.kind}:${np.slug}`);
    setEditing({ docSlug: slug, blockId: String((block as { id?: string }).id ?? ''), text, linked, insert: (id: string) => {
      editor.focus();
      // a tag glued to the previous word would change it; pad with a space unless the cursor already follows one
      const st = (editor as unknown as { _tiptapEditor: { state: { selection: { from: number }; doc: { textBetween: (a: number, b: number) => string } } } })._tiptapEditor.state;
      const before = st.selection.from > 0 ? st.doc.textBetween(st.selection.from - 1, st.selection.from) : '';
      editor.insertInlineContent([...(before && !/\s/.test(before) ? [' '] : []), { type: 'tag', props: { id } }, ' '] as never);
      touched.current = true; changed(); publishContext();
    } });
  };
  useEditorSelectionChange(publishContext, editor);
  useEditorChange(publishContext, editor);
  // The context column is always there on a document page; it leaves with the editor.
  useEffect(() => { setShowContext(true); return () => { setEditing(null); setShowContext(false); }; }, [setEditing, setShowContext]);

  // ids already used in this product (so a new row never collides)
  const settle = (assignSlugs = false) => { const taken = new Set(Object.keys(index)); for (const b of editor.document as unknown as AnyBlock[]) for (const k of b.children ?? []) if (k.type === 'node') { const p = k.props as unknown as { kind: string; slug: string }; if (p.slug) taken.add(`${p.kind}:${p.slug}`); } return settleCollections(editor as never, taken, assignSlugs); };
  const load = (md: string) => {
    loading.current = true;
    try {
      const { md: prepared, yaml, drawings } = prepare(md);
      const parsed = editor.tryParseMarkdownToBlocks(prepared) as unknown as AnyBlock[];
      const blocks = expand(parsed, yaml, drawings);
      editor.replaceBlocks(editor.document, blocks as never);
      settle();
      lastExported.current = blocksToMarkdown(editor.document as unknown as AnyBlock[]);
      const shrink = lastExported.current.replace(/\s+/g, '').length / Math.max(1, md.replace(/\s+/g, '').length);
      if (shrink < 0.9) throw new Error(`the editor could not represent this document faithfully (${Math.round(shrink * 100)}% of the text survived import)`);
      setLoadError(null);
    } catch (err) {
      console.error('document import failed', err);
      setLoadError(err instanceof Error ? err.message : String(err));
      lastExported.current = null; // nothing may be saved from a failed import
    } finally { loading.current = false; }
  };
  useEffect(() => {
    hash.current = ifMatch;
    if (lastExported.current !== null && norm(lastExported.current) === norm(body)) return;
    load(body);
    if (!ready) setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, body, ifMatch]);

  async function save(md: string) {
    setState('saving');
    const r = await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-body', ifMatch: hash.current, body: md }) });
    const j = await r.json();
    if (!r.ok) { setState(j.error === 'conflict' ? 'conflict' : 'error'); return; }
    hash.current = j.bodyHash ?? hash.current;
    setLintMsg(j.lintOk ? null : (j.lintErrors as string[]).join(' · '));
    setState('saved'); router.refresh();
  }
  const settling = useRef(false);
  const changed = () => {
    if (loading.current) return;
    if (!settling.current) { settling.current = true; try { settle(); } finally { settling.current = false; } }
    if (!touched.current || lastExported.current === null) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (lastExported.current === null) return;
      const md = blocksToMarkdown(editor.document as unknown as AnyBlock[]);
      if (norm(md) === norm(lastExported.current)) return;
      // Guard against wiping a document: a save that drops more than half of the text is refused with a notice.
      const before = lastExported.current.replace(/\s+/g, '').length, after = md.replace(/\s+/g, '').length;
      if (before > 200 && after < before / 2) { setState('error'); setLintMsg('refused: this change would remove more than half of the document; reload if that was not intended'); return; }
      lastExported.current = md; save(md);
    }, 700);
  };
  // On leaving the editor: ids typed as text become tags and a paragraph that starts with an id becomes a node block.
  const retag = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (settle(true)) changed();
    const before = JSON.stringify(editor.document);
    const after = expand(editor.document as unknown as AnyBlock[], []);
    if (JSON.stringify(after) === before) return;
    loading.current = true; editor.replaceBlocks(editor.document, after as never); loading.current = false;
    changed(); // the converted blocks may serialise differently (aliases expanded, node lines); save that
  };
  const createDoc = async (title: string): Promise<string | null> => {
    const r = await fetch(`/api/${product}/${project}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, template: 'blank', parent: slug }) });
    const j = await r.json();
    if (!r.ok) { setLintMsg(`could not create document: ${j.message ?? j.error}`); return null; }
    router.refresh();
    return `module:${j.slug}`;
  };
  const applyLink = (id: string) => {
    if (!linkReq) return;
    // Restore the captured range (typing in the picker collapsed it), then use BlockNote's own createLink so the
    // block's inline content stays consistent (a raw ProseMirror mark breaks BlockNote's block conversion).
    const tt = (editor as unknown as { _tiptapEditor: { view: { focus: () => void }; commands: { setTextSelection: (r: { from: number; to: number }) => boolean } } })._tiptapEditor;
    tt.view.focus();
    tt.commands.setTextSelection({ from: linkReq.from, to: linkReq.to });
    editor.createLink(id, linkReq.text || id);
    setLinkReq(null); touched.current = true; changed();
  };
  // "@" inserts a tag for any node (or document) by id or title.
  const mentionItems = (q: string) => {
    const n = q.trim().toLowerCase();
    return Object.values(index)
      .filter(e => e.id.toLowerCase().includes(n) || e.title.toLowerCase().includes(n))
      .sort((a, b) => Number(b.defined) - Number(a.defined) || a.id.length - b.id.length)
      .slice(0, 10)
      .map(e => ({ title: e.id, subtext: e.title, group: 'Link a node', onItemClick: () => { editor.insertInlineContent([{ type: 'tag', props: { id: e.id } }, ' '] as never); touched.current = true; changed(); } }));
  };
  const nodeItems = CARD_KINDS.map(kind => ({
    title: `${kind} block`, group: 'Waterfall', subtext: `a new ${kind} written as prose`,
    onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'node', props: { kind, slug: `new-${Math.floor(Math.random() * 900 + 100)}`, form: 'prose', textKey: 'text', check: kind === 'task' ? 'todo' : '', status: kind === 'task' ? 'open' : '' } } as never); },
  }));

  // Drawings: a new empty scene, or the current code block turned into a monospace text element (ASCII diagrams).
  const codeToDrawing = async (cur: AnyBlock) => {
    if (cur.type !== 'codeBlock') { setLintMsg('put the cursor in a code block first'); return; }
    const text = ((cur.content ?? []) as { type: string; text?: string }[]).map(i => i.text ?? '').join('');
    const slug = newDrawingSlug();
    const ok = await sceneFromText(product, project, slug, text);
    if (!ok) { setLintMsg('could not create the drawing'); return; }
    editor.replaceBlocks([cur as never], [{ type: 'drawing', props: { src: `drawings/${slug}.excalidraw`, title: 'Diagram' } } as never]);
    touched.current = true; changed();
  };
  if (typeof window !== 'undefined') (window as unknown as { __wfCodeToDrawing: (id: string) => void }).__wfCodeToDrawing = (id: string) => { const b = editor.getBlock(id) as unknown as AnyBlock | undefined; if (b) codeToDrawing(b); }; // dev inspection
  const collectionItems = (['goal', 'task'] as const).map(kind => ({
    title: `${kind === 'goal' ? 'Goals' : 'Tasks'} table`, group: 'Waterfall', subtext: `a table of ${kind}s with status, ${kind === 'goal' ? 'target' : 'due date'}, progress and owner`,
    onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'collection', props: { kind }, children: [emptyRow(kind)] } as never); setTimeout(() => settle(), 0); touched.current = true; changed(); },
  }));
  const drawingItems = [
    { title: 'Drawing', group: 'Waterfall', subtext: 'an Excalidraw sketch saved next to the document', onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'drawing', props: { src: `drawings/${newDrawingSlug()}.excalidraw`, title: 'Drawing' } } as never); touched.current = true; changed(); } },
    { title: 'Code block → drawing', group: 'Waterfall', subtext: 'turn this ASCII diagram into an editable drawing', onItemClick: () => codeToDrawing(editor.getTextCursorPosition().block as unknown as AnyBlock) },
  ];

  if (loadError) return <div className="doc-editor"><p className="notice">Editing is off for this document: {loadError}. The text below is read-only.</p>{fallback}</div>;
  return (
    <div className="doc-editor" data-product={product} data-project={project} data-doc={slug} onBlur={retag} onFocus={() => { touched.current = true; }}
      onClick={e => { // a link whose target is a node id opens the peek panel instead of navigating
        const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
        const href = a?.getAttribute('href') ?? '';
        if (a && !a.classList.contains('tag') && new RegExp('^' + ID_RE.source + '$').test(href)) {
          e.preventDefault();
          const doc = href.startsWith('module:') ? hrefFor(href) : null;
          if (doc) router.push(doc.replace(/#.*$/, '')); else openPeek(href);
        }
      }}>
      <div className="doc-editor-bar"><span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'conflict' ? 'changed on disk — reload' : state === 'error' ? 'save failed' : ready ? 'live' : 'loading…'}</span>{lintMsg && <span className="notice">Lint: {lintMsg}</span>}</div>
      <BlockNoteView editor={editor} theme={theme} onChange={changed} formattingToolbar={false} slashMenu={false} sideMenu={false}>
        <SideMenuController sideMenu={p => <SideMenu {...p} dragHandleMenu={() => <DragHandleMenu><RemoveBlockItem>Delete</RemoveBlockItem><BlockColorsItem>Colors</BlockColorsItem><ToDrawingItem convert={codeToDrawing} /><SendToAgentItem /></DragHandleMenu>} />} />
        <FormattingToolbarController formattingToolbar={() => <FormattingToolbar>{...getFormattingToolbarItems()}<LinkNodeButton onRequest={setLinkReq} /></FormattingToolbar>} />
        <SuggestionMenuController triggerCharacter="/" getItems={async q => filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...nodeItems, ...collectionItems, ...drawingItems], q)} />
        <SuggestionMenuController triggerCharacter="@" minQueryLength={1} getItems={async q => mentionItems(q)} />
      </BlockNoteView>
      {linkReq && <LinkNodePicker req={linkReq} onClose={() => setLinkReq(null)} apply={applyLink} createDoc={createDoc} />}
    </div>
  );
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
