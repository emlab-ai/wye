'use client';
import { useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, getNodeById } from '@blocknote/core';
import { useCreateBlockNote, createReactInlineContentSpec, createReactBlockSpec, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems, SuggestionMenuController, getDefaultReactSlashMenuItems, useBlockNoteEditor, useComponentsContext, SideMenuController, SideMenu, DragHandleMenu, RemoveBlockItem, BlockColorsItem, useExtensionState, useEditorSelectionChange, useEditorChange } from '@blocknote/react';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { expand, importMarkdown } from '@/lib/import';
import { EditorScope } from './EditorScope';
import { pluralTitle } from '@/lib/instances';
import { blocksToMarkdown, inlineToMarkdown, type AnyBlock } from '@/lib/serialize';
import type { Inline } from '@/lib/mdflow';
import { CARD_KINDS } from '@/lib/kinds';
import { NodeCard, type CardP, type CardHost } from './NodeCards';
import { SmartTag } from './SmartTag';
import { DrawingBlock, newDrawingSlug, sceneFromText, sceneFromImage } from './DrawingBlock';
import { ViewBlock } from './ViewBlock';
import { EmbedBlock } from './EmbedBlock';
import { usePeek, type OwnType } from './PeekProvider';
import { ID_RE } from '@/lib/ids';
import { parseExtra, withExtra, GOAL_STATUSES, TASK_STATUSES, STATUSES } from '@/lib/props';
import { filterRows, parseViewQuery, viewQuery, EMPTY_FILTERS, type Filters, type InstanceRow } from '@/lib/instance-table';
import { slugify } from '@/lib/templates';
import { blockHash } from '@/lib/anchors';
import { applyLinks, blockText, blockLinked, type LinkBlock } from '@/lib/apply-links';
import { headingSlug, DONE_STATUSES } from '@/lib/doc';
import { ProgressBar } from './Progress';
import { requestSend } from './CommandBox';
import { AskAgentBox, type AskRequest } from './AskAgent';


// kind:slug as inline content: a clickable tag in the editor, plain id text when serialised.
const Tag = createReactInlineContentSpec(
  { type: 'tag', propSchema: { id: { default: '' } }, content: 'none' },
  { render: props => <SmartTag id={props.inlineContent.props.id} />, toExternalHTML: props => <span>{props.inlineContent.props.id}</span> },
);

// An image inside a block's text (a bug's screenshot next to its words): the markdown keeps ![alt](assets/x.png) in
// the line, so the parser's node text carries it and agents find the file. A thumbnail here; click opens the file.
const InlineImage = createReactInlineContentSpec(
  { type: 'img', propSchema: { url: { default: '' }, alt: { default: '' } }, content: 'none' },
  {
    render: props => <img className="inline-img" src={props.inlineContent.props.url} alt={props.inlineContent.props.alt} title={props.inlineContent.props.alt || props.inlineContent.props.url} onClick={() => window.open(props.inlineContent.props.url, '_blank')} />,
    toExternalHTML: props => <img src={props.inlineContent.props.url} alt={props.inlineContent.props.alt} />,
  },
);

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
  requestSend({ text, refs, source: { project: doc?.dataset.project, doc: doc?.dataset.doc, blockId: String((block as { id?: string }).id ?? ''), link: blockLink(block, host) } });
}

// The stable address of a block: node id, heading slug, or a hash of its text (see lib/anchors).
function blockAnchor(block: AnyBlock): string {
  if (block.type === 'node') { const np = block.props as unknown as { kind: string; slug: string }; return `n-${encodeURIComponent(`${np.kind}:${np.slug}`)}`; }
  if (block.type === 'embed') return `b-${blockHash(`![[${(block.props as { node?: string }).node ?? ''}]]`)}`; // the graph's paragraph
  const text = rowText(block);
  if (block.type === 'heading') return headingSlug(text);
  return `b-${blockHash(text)}`;
}
function blockLink(block: AnyBlock, host: HTMLElement | null): string {
  const doc = host?.closest('.doc-editor') as HTMLElement | null;
  return `${location.origin}/${doc?.dataset.product}/${doc?.dataset.project}/d/${doc?.dataset.doc}#${blockAnchor(block)}`;
}
async function copyBlockLink(block: AnyBlock, host: HTMLElement | null) {
  const url = blockLink(block, host);
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
}
function toast(text: string) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.appendChild(el);
  setTimeout(() => el.classList.add('on'), 10); setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, 1800);
}

// Drag-handle menu entry on every block: copy its link.
function CopyLinkItem() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: st => st?.block });
  if (!block) return null;
  return <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => copyBlockLink(block as unknown as AnyBlock, editor.domElement as HTMLElement | null)}>Copy link</Components.Generic.Menu.Item>;
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
function RowNode({ p, set, contentRef, block, editor }: { p: { kind: string; slug: string; status: string; extra: string; check: string; row: string }; set: (patch: Partial<typeof p>) => void; contentRef: (el: HTMLElement | null) => void; block: AnyBlock; editor: EditorLike }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { index } = usePeek();
  const idOf = (b: AnyBlock) => { const bp = b.props as unknown as { kind: string; slug: string }; return `${bp.kind}:${bp.slug}`; };
  const peek = () => { const b = withSlug(editor, index, block); if ((b.props as unknown as { slug: string }).slug) emit('wf:select', rowRef.current, idOf(b)); };
  const id = `${p.kind}:${p.slug}`; const e = index[id];
  const empty = !p.slug && !rowText(block);
  const ex = parseExtra(p.extra);
  const statuses = p.kind === 'goal' ? GOAL_STATUSES : TASK_STATUSES;
  const done = p.check === 'done' || p.status === 'done' || p.status === 'complete';
  const explicit = ex.progress ? Number(ex.progress) : undefined;
  const progress = explicit ?? (done ? 100 : e?.progress);
  const setStatus = (st: string) => set(p.kind === 'task' ? { status: st, check: st === 'done' ? 'done' : 'todo' } : { status: st });
  // a row shows only its own text; the blocks under it (subtasks, notes) are in the details (rule:card-fold)
  const { fold, hide } = useFold(block, peek);
  return (
    <div className={`nrow k-${p.kind} ${done ? 'done' : ''} ${empty ? 'empty' : ''}`} data-id={id} ref={rowRef} onClick={selectBlockOnClick(editor, block, rowRef.current?.querySelector('.nrow-text') ?? null)}>
      {hide}
      <div className="nrow-cell nrow-name">
        {p.kind === 'task' && <input type="checkbox" className="nblock-check" checked={done} onChange={ev => setStatus(ev.target.checked ? 'done' : 'todo')} title="done?" onMouseDown={ev => ev.stopPropagation()} />}
        <button type="button" className="nrow-open" contentEditable={false} title={id} onMouseDown={ev => ev.stopPropagation()} onClick={peek}><i style={{ background: `var(--k-${p.kind}, var(--k-other))` }} /></button>
        <div className="nrow-text" ref={contentRef} data-placeholder={`New ${p.kind}…`} />
        <RowFold fold={fold} />
        <button type="button" className="nrow-send" contentEditable={false} title="Copy link" onMouseDown={ev => ev.stopPropagation()} onClick={() => copyBlockLink(withSlug(editor, index, block), rowRef.current)}>⧉</button>
        <button type="button" className="nrow-send" contentEditable={false} title="Send to agent" onMouseDown={ev => ev.stopPropagation()} onClick={() => sendBlock(withSlug(editor, index, block), rowRef.current)}>⇢</button>
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

// A row of a type table (a product's own type): name, status, then one cell per property of the type; values live in
// the node's trailing property group, so the line stays `- bug:slug Text #status (severity: high, …)`.
function TypeRow({ p, set, contentRef, block, type, editor }: { p: { kind: string; slug: string; status: string; extra: string }; set: (patch: Partial<typeof p>) => void; contentRef: (el: HTMLElement | null) => void; block: AnyBlock; type: OwnType; editor: EditorLike }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { index } = usePeek();
  const id = `${p.kind}:${p.slug}`;
  const peek = () => { const b = withSlug(editor, index, block); const bp = b.props as unknown as { kind: string; slug: string }; if (bp.slug) emit('wf:select', rowRef.current, `${bp.kind}:${bp.slug}`); };
  const empty = !p.slug && !rowText(block);
  const ex = parseExtra(p.extra);
  const done = DONE_STATUSES.has(p.status);
  const { fold, hide } = useFold(block, peek);
  return (
    <div className={`nrow nrow-type k-${p.kind} ${done ? 'done' : ''} ${empty ? 'empty' : ''}`} data-id={id} ref={rowRef} style={{ gridTemplateColumns: typeGrid(type) }} onClick={selectBlockOnClick(editor, block, rowRef.current?.querySelector('.nrow-text') ?? null)}>
      {hide}
      <div className="nrow-cell nrow-name">
        <button type="button" className="nrow-open" contentEditable={false} title={id} onMouseDown={ev => ev.stopPropagation()} onClick={peek}><i style={{ background: `var(--k-${p.kind}, var(--k-other))` }} /></button>
        <div className="nrow-text" ref={contentRef} data-placeholder={`New ${p.kind}…`} />
        <RowFold fold={fold} />
        <button type="button" className="nrow-send" contentEditable={false} title="Copy link" onMouseDown={ev => ev.stopPropagation()} onClick={() => copyBlockLink(withSlug(editor, index, block), rowRef.current)}>⧉</button>
        <button type="button" className="nrow-send" contentEditable={false} title="Send to agent" onMouseDown={ev => ev.stopPropagation()} onClick={() => sendBlock(withSlug(editor, index, block), rowRef.current)}>⇢</button>
      </div>
      <div className="nrow-cell" contentEditable={false} ref={stopEditorEvents}>
        <select className={`status-sel s-${p.status}`} value={p.status} onChange={ev => set({ status: ev.target.value })}>
          {(STATUSES.includes(p.status) ? [] : [p.status]).concat(STATUSES).map(st => <option key={st} value={st}>{st || '— status'}</option>)}
        </select>
      </div>
      {type.cols.map(c => (
        <div key={c.name} className="nrow-cell" contentEditable={false} ref={stopEditorEvents}>
          {c.enum ? (
            <select className="nrow-in" value={ex[c.name] ?? ''} onChange={ev => set({ extra: withExtra(p.extra, c.name, ev.target.value) })}>
              {(ex[c.name] && !c.enum.includes(ex[c.name]) ? [ex[c.name]] : []).concat(['', ...c.enum]).map(v => <option key={v} value={v}>{v || `— ${c.name}`}</option>)}
            </select>
          ) : c.type === 'bool' ? (
            <input type="checkbox" checked={ex[c.name] === 'true' || ex[c.name] === 'yes'} title={c.name} onChange={ev => set({ extra: withExtra(p.extra, c.name, ev.target.checked ? 'true' : '') })} />
          ) : (
            <input className="nrow-in" value={ex[c.name] ?? ''} placeholder={c.ref ? `${c.ref}:…` : c.name} title={c.ref ? `${c.name} — a ${c.ref} id` : `${c.name} (${c.type})`} onChange={ev => set({ extra: withExtra(p.extra, c.name, ev.target.value) })} />
          )}
        </div>))}
    </div>
  );
}
// name (never under 200px — a narrow editor scrolls the table, rule:table-scroll), status, then one column per property
// (comma-separated values such as ids get room)
const typeGrid = (t: OwnType) => `minmax(200px, 1fr) 100px${t.cols.map(c => c.type === 'bool' ? ' 40px' : c.ref ? ' minmax(90px, 150px)' : ' minmax(72px, 120px)').join('')}`;

// Selecting a row or block by clicking anything in it but its text (a status select, a property cell, the grid
// background) puts the editor cursor in that block without taking focus from the control, so the context column
// shows the node — the same as clicking its text (bug:when-i-select-a).
type EditorLike = { setTextCursorPosition: (id: string, at: 'start' | 'end') => void; getTextCursorPosition?: () => { block: { id: string } }; getBlock: (id: string) => unknown; document: unknown; updateBlock: (b: unknown, u: unknown) => void; insertBlocks: (blocks: unknown[], ref: string, placement: 'before' | 'after') => unknown; removeBlocks: (ids: string[]) => unknown };
// A click anywhere on the block — its text too — also selects its node: the context column comes to its Context
// root and shows it, whatever it showed before (rule:block-select). A tag or link inside the block navigates instead.
function selectBlockOnClick(editor: EditorLike, block: AnyBlock, textEl: HTMLElement | null) {
  return (e: React.MouseEvent) => {
    if ((e.target as Element).closest('a')) return;
    const id = String((block as { id?: string }).id);
    if (!textEl || !textEl.contains(e.target as Node)) {
      try { editor.setTextCursorPosition(id, 'end'); } catch { /* block gone */ }
      // the cursor may already be in this block (no selection change fires): ask the editor to publish the context anyway
      window.dispatchEvent(new CustomEvent('wf:publish'));
    } else {
      // clicking the text places the caret itself — unless the editor's selection did not follow the click (seen
      // now and then after a transaction dispatched while a control in the table's header had the focus): the
      // caret then sits in the row's DOM while the editor still thinks it is elsewhere, and the first keystroke
      // would count as leaving the previous block (a slug assigned at once, rule:table-rows). Bring it here.
      let at = ''; try { at = editor.getTextCursorPosition?.().block.id ?? ''; } catch { /* no selection */ }
      if (at && at !== id) { try { editor.setTextCursorPosition(id, 'end'); } catch { /* block gone */ } }
    }
    const bp = block.props as unknown as { kind?: string; slug?: string };
    if (bp.kind && bp.slug) emit('wf:select', e.currentTarget as HTMLElement, `${bp.kind}:${bp.slug}`);
  };
}
// A block asks its own editor — the page's or the content editor in the column (rule:content-editor) — through a
// DOM event that bubbles from the block to the editor's container; window when the block has no element yet.
function emit(name: 'wf:select' | 'wf:peek', from: HTMLElement | null | undefined, id: string) {
  (from ?? window).dispatchEvent(new CustomEvent(name, { detail: id, bubbles: true }));
}

// A row that has text but no slug yet (slugs are assigned when the cursor leaves the row) gets one now, so a link,
// a send or a peek from the row never says `bug:` with nothing after the colon.
function withSlug(editor: EditorLike, index: Record<string, unknown>, block: AnyBlock): AnyBlock {
  const p = block.props as unknown as { slug?: string };
  if (p.slug || !rowText(block)) return block;
  const taken = new Set(Object.keys(index));
  for (const b of editor.document as AnyBlock[]) for (const k of b.children ?? []) if (k.type === 'node') { const kp = k.props as unknown as { kind: string; slug: string }; if (kp.slug) taken.add(`${kp.kind}:${kp.slug}`); }
  settleCollections(editor, taken, true);
  return (editor.getBlock(String((block as { id?: string }).id)) as AnyBlock | undefined) ?? block;
}

// An empty row for a goals/tasks/type table: typing into it makes it a real item.
// a fresh row of a collection: in a table it renders as a row (`row: kind`), in a list as an ordinary block (rule:list-view)
const emptyRow = (kind: string, view = 'table') => ({ type: 'node', props: { kind, slug: '', status: kind === 'goal' ? 'proposed' : kind === 'task' ? 'open' : '', form: 'prose', textKey: 'text', body: '', extra: '', check: kind === 'task' ? 'todo' : '', list: 'bullet', row: view === 'list' ? '' : kind }, content: [] as unknown[] });
const rowText = (b: AnyBlock) => (Array.isArray(b.content) ? (b.content as { type: string; text?: string; props?: { id?: string } }[]).map(i => i.type === 'text' ? i.text ?? '' : i.type === 'tag' ? i.props?.id ?? '' : '').join('') : '').trim();

// Every goals/tasks/type table ends with one empty row; a row that gained text gets its id, and a new empty row
// follows. Each change is a targeted insert, removal or prop update — never a rewrite of the children array, which
// would move the cursor out of the row being typed into. Returns true when blocks were changed.
function settleCollections(editor: EditorLike, taken: Set<string>, assignSlugs: boolean): boolean {
  let changed = false;
  for (const b of editor.document as AnyBlock[]) {
    if (b.type !== 'collection') continue;
    const { kind, view = 'table' } = b.props as { kind: string; view?: string };
    const kids = [...(b.children ?? [])] as AnyBlock[];
    // Enter in a row makes a paragraph: inside a table or list every child is a node of the kind, so it becomes one (its text kept)
    for (const k of kids) if (k.type !== 'node' && Array.isArray(k.content)) { editor.updateBlock(k, { type: 'node', props: emptyRow(kind, view).props, content: k.content }); k.type = 'node'; k.props = { ...emptyRow(kind, view).props }; changed = true; }
    // ids for rows that have text but no slug yet
    for (const k of kids) {
      if (k.type !== 'node') continue;
      const p = k.props as unknown as { slug: string; kind: string };
      const text = rowText(k);
      if (assignSlugs && !p.slug && text) {
        let base = slugify(text.split(/\s+/).slice(0, 4).join(' ')) || kind; let slug = base; let n = 2;
        while (taken.has(`${kind}:${slug}`)) slug = `${base}-${n++}`;
        taken.add(`${kind}:${slug}`);
        editor.updateBlock(k, { props: { ...k.props, slug } }); changed = true;
      }
    }
    // exactly one empty row, at the end: a missing one is appended after the last row; empty rows elsewhere (an
    // Enter that opened a row nobody typed into) go when the cursor leaves the table, not while typing
    const isEmpty = (k: AnyBlock) => k.type === 'node' && !rowText(k) && !(k.props as unknown as { slug: string }).slug;
    const stray = assignSlugs ? kids.filter((k, i) => isEmpty(k) && i < kids.length - 1) : [];
    if (stray.length) { editor.removeBlocks(stray.map(k => String((k as { id?: string }).id))); changed = true; }
    const last = kids[kids.length - 1];
    if (!last) { editor.updateBlock(b, { children: [emptyRow(kind, view)] }); changed = true; }
    else if (!isEmpty(last)) { editor.insertBlocks([emptyRow(kind, view)], String((last as { id?: string }).id), 'after'); changed = true; }
  }
  return changed;
}

// looks the row's type up in the product's own types; an unknown type still gets a row with name and status
function TypeRowFor({ p, set, contentRef, block, editor }: { p: { kind: string; slug: string; status: string; extra: string; row: string }; set: (patch: Partial<typeof p>) => void; contentRef: (el: HTMLElement | null) => void; block: AnyBlock; editor: EditorLike }) {
  const { ownTypes } = usePeek();
  const type = ownTypes.find(t => t.slug === p.row) ?? { slug: p.row, cols: [] };
  return <TypeRow p={p} set={set} contentRef={contentRef} block={block} type={type} editor={editor} />;
}

// A table: one block for goals, tasks and every type the product declares; the header's type picker sets the kind
// of its rows (decision:wf2.one-table-block). The rows are the block's children (nodes in row mode). The type can
// change while no row has text — after that the rows have ids of that kind. `view: list` shows the same children as
// ordinary blocks under the same filter bar (rule:list-view); the header toggles between the two.
const CollectionBlock = createReactBlockSpec(
  { type: 'collection', propSchema: { kind: { default: 'goal' }, query: { default: '' }, view: { default: 'table' } }, content: 'none' },
  {
    render: props => {
      const { kind, query, view } = props.block.props as { kind: string; query: string; view: string };
      const { ownTypes } = usePeek();
      const type = kind === 'goal' || kind === 'task' ? undefined : ownTypes.find(t => t.slug === kind);
      // the header re-renders on every editor change: whether the type can still change depends on the rows' text
      const [, tick] = useState(0); useEditorChange(() => tick(t => t + 1), props.editor);
      useEditorSelectionChange(() => tick(t => t + 1), props.editor); // the row under the cursor is never hidden by a filter
      const kids = ((props.editor.getBlock(props.block.id) as unknown as AnyBlock | undefined)?.children ?? []) as AnyBlock[];
      const locked = kids.some(k => k.type === 'node' && rowText(k));
      const options = ['goal', 'task', ...ownTypes.map(t => t.slug)]; if (!options.includes(kind)) options.push(kind);
      const setKind = (k: string) => {
        if (k === kind || locked) return;
        for (const c of kids) if (c.type === 'node') props.editor.updateBlock(c as never, { props: { ...emptyRow(k, view).props, slug: '' } } as never);
        props.editor.updateBlock(props.block, { props: { kind: k, query: '', view } } as never);
      };
      // table ⇄ list: the same children, rendered as rows or as blocks (their `row` prop says which)
      const setView = (v: string) => {
        if (v === view) return;
        for (const c of kids) if (c.type === 'node') props.editor.updateBlock(c as never, { props: { ...(c.props as object), row: v === 'list' ? '' : kind } } as never);
        props.editor.updateBlock(props.block, { props: { kind, query, view: v } } as never);
      };
      const viewToggle = (
        <button type="button" className="collection-view-toggle" title={view === 'list' ? 'show as a table' : 'show as blocks'} onMouseDown={e => e.stopPropagation()} onClick={() => setView(view === 'list' ? 'table' : 'list')}>{view === 'list' ? '▤ table' : '☰ list'}</button>
      );
      const filter = useTableFilter(props.editor as unknown as EditorLike, props.block as unknown as AnyBlock, kids, type ?? (kind === 'goal' || kind === 'task' ? undefined : { slug: kind, cols: [] }), query);
      const picker = (
        <select className="collection-kind" value={kind} disabled={locked} title={locked ? 'rows already have ids of this type; start another table for another type' : 'the type of this table'} onChange={e => setKind(e.target.value)} onMouseDown={e => e.stopPropagation()}>
          {options.map(o => <option key={o} value={o}>{pluralTitle({ slug: o, plural: ownTypes.find(t => t.slug === o)?.plural })}</option>)}
        </select>
      );
      if (view === 'list') return (
        <div className={`collection c-list c-${kind}`} contentEditable={false} ref={stopEditorEvents}>
          {filter.hide}
          <div className="collection-list-head">{picker}{filter.toggle}{viewToggle}<span className="muted small">{kids.filter(k => k.type === 'node' && rowText(k)).length}</span></div>
          {filter.bar}
        </div>
      );
      if (kind !== 'goal' && kind !== 'task') return (
        <div className={`collection c-type c-${kind}`} contentEditable={false} ref={stopEditorEvents}>
          {filter.hide}{filter.bar}
          <div className="nrow nrow-head nrow-type" style={{ gridTemplateColumns: typeGrid(type ?? { slug: kind, cols: [] }) }}>
            <div className="nrow-cell nrow-name">{picker}{!type && <span className="muted" title="the product declares no such type; rows are still written">?</span>}{filter.toggle}{viewToggle}</div><div className="nrow-cell">Status</div>
            {(type?.cols ?? []).map(c => <div key={c.name} className="nrow-cell" title={c.ref ? `${c.type}` : c.type}>{c.name}</div>)}
          </div>
        </div>
      );
      return (
        <div className={`collection c-${kind}`} contentEditable={false} ref={stopEditorEvents}>
          {filter.hide}{filter.bar}
          <div className="nrow nrow-head">
            <div className="nrow-cell nrow-name">{picker}{filter.toggle}{viewToggle}</div><div className="nrow-cell">Status</div><div className="nrow-cell">{kind === 'goal' ? 'Target' : 'Due'}</div><div className="nrow-cell nrow-progress">Progress</div><div className="nrow-cell">Owner</div>
          </div>
        </div>
      );
    },
  },
);

// The table's filters (req:wf2.editor.table-filter, rule:table-filter): a toolbar in the header — search, status
// chips with counts, a chip row per enum / bool column, a select per ref column (owner for goals and tasks) — the
// same filter as the type page (lib/instance-table#filterRows) over the row blocks. A row that does not match is
// hidden, not removed: the header renders a style element that hides the rows' `.bn-block-outer` by block id, so
// the row stays a child block and is written to the file. A row without a slug (the trailing empty row) and the row
// the cursor is in (one being typed, one reached with the arrow keys) are never hidden. The state lives on the block's `query` prop (the marker line,
// decision:wf2.table-filter-on-marker) in the view block's key=value grammar; search typing is written back after
// a pause, chips at once.
type RowP = { kind: string; slug: string; status: string; extra: string };
// One attribute of a block's content node, set in place: editor.updateBlock would replace the whole block with its
// children, rebuilding every row's node view for a filter change; a setNodeMarkup touches the header's node only.
function setBlockAttr(editor: EditorLike, blockId: string, key: string, value: string) {
  const ed = editor as unknown as { transact?: (f: (tr: { doc: unknown; setNodeMarkup: (pos: number, type: undefined, attrs: Record<string, unknown>) => unknown }) => void) => void };
  if (!ed.transact) return;
  ed.transact(tr => {
    const found = getNodeById(blockId, tr.doc as never); const content = found?.node.firstChild;
    if (!found || !content) return;
    if (content.attrs[key] === value) return;
    tr.setNodeMarkup(found.posBeforeNode + 1, undefined, { ...content.attrs, [key]: value });
  });
}
function useTableFilter(editor: EditorLike, block: AnyBlock, kids: AnyBlock[], type: OwnType | undefined, query: string) {
  const cols = type ? type.cols.map(c => c.name) : ['owner'];
  const [f, setF] = useState<Filters>(() => parseViewQuery(query, cols));
  const [open, setOpen] = useState(false);
  const colsKey = cols.join(',');
  // the prop changed under us (a reload, another editor): take it
  useEffect(() => { if (viewQuery(parseViewQuery(query, cols)) !== viewQuery(f)) setF(parseViewQuery(query, cols)); }, [query, colsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // write the state to the block — after a pause, so a search keystroke is not a document change each
  useEffect(() => {
    const q = viewQuery(f); if (q === viewQuery(parseViewQuery(query, cols))) return;
    const t = setTimeout(() => setBlockAttr(editor, String((block as { id?: string }).id), 'query', q), 250);
    return () => clearTimeout(t);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = kids.filter(k => k.type === 'node' && (k.props as unknown as RowP).slug);
  const asRow = (k: AnyBlock): InstanceRow => { const rp = k.props as unknown as RowP; return { id: `${rp.kind}:${rp.slug}`, kind: rp.kind, title: rowText(k), status: rp.status, file: '', doc: '', props: parseExtra(rp.extra) }; };
  const irows = rows.map(asRow);
  const active = !!(f.q || f.status || Object.values(f.props).some(Boolean));
  const kept = active ? new Set(filterRows(irows, { ...f, group: '', sort: '' }).map(r => r.id)) : null;
  // a row gets its slug at the first keystroke, so "no slug yet" is not enough: the row the cursor is in stays visible
  let cursor = ''; try { cursor = editor.getTextCursorPosition?.().block.id ?? ''; } catch { /* no selection */ }
  const hidden = new Set(kept ? rows.filter(k => !kept.has(asRow(k).id) && String((k as { id?: string }).id) !== cursor).map(k => String((k as { id?: string }).id)) : []);
  // the hidden rows are a stylesheet the header owns: BlockNote may rebuild a row's wrapper at any time, a style
  // element React renders survives that where an attribute set on the wrapper would not
  // zero height + clipped rather than display: none: a row taken out of layout entirely made ProseMirror map a click
  // on the row after it to the wrong block (the caret landed in the next paragraph until the first keystroke)
  const hide = hidden.size ? <style>{[...hidden].map(id => `.bn-block-outer[data-id="${id}"]`).join(', ') + ' { height: 0; min-height: 0; overflow: hidden; visibility: hidden; }'}</style> : null;
  const count = new Map<string, number>(); for (const r of irows) if (r.status) count.set(r.status, (count.get(r.status) ?? 0) + 1);
  const statuses = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const seen = (name: string) => [...new Set(irows.flatMap(r => (r.props[name] ?? '').replace(/^\[|\]$/g, '').split(',').map(v => v.trim()).filter(Boolean)))].sort();
  const setProp = (name: string, v: string) => setF({ ...f, props: { ...f.props, [name]: f.props[name] === v ? '' : v } });
  const chipCols = type ? type.cols.filter(c => c.enum || c.type === 'bool') : [];
  const selectCols = type ? type.cols.filter(c => c.ref && !c.enum) : [{ name: 'owner', type: 'string', enum: null, ref: null, required: false }];
  const toggle = (
    <button type="button" className={`collection-filter-toggle ${active ? 'on' : ''}`} title={active ? 'filters set — click to show them' : 'filter the rows'} onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(o => !o)}>⏷ filter{active ? ` ${kept!.size}/${rows.length}` : ''}</button>
  );
  const bar = (open || active) ? (
    <div className="track-tools collection-filter" ref={stopEditorEvents} onMouseDown={e => e.stopPropagation()}>
      <div className="chips">
        <input type="search" placeholder="Search rows…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <button type="button" className={`chip ${!f.status ? 'on' : ''}`} onClick={() => setF({ ...f, status: '' })}>All <small>{rows.length}</small></button>
        {statuses.map(([st, n]) => <button type="button" key={st} className={`chip s-${st} ${f.status === st ? 'on' : ''}`} onClick={() => setF({ ...f, status: f.status === st ? '' : st })}>{st} <small>{n}</small></button>)}
      </div>
      {chipCols.map(c => (
        <div key={c.name} className="chips"><span className="chips-label">{c.name}</span>
          {(c.type === 'bool' ? ['true', 'false'] : c.enum ?? []).map(v => <button type="button" key={v} className={`chip ${f.props[c.name] === v ? 'on' : ''}`} onClick={() => setProp(c.name, v)}>{v}</button>)}
        </div>))}
      {selectCols.map(c => { const vals = seen(c.name); return vals.length ? (
        <div key={c.name} className="chips"><span className="chips-label">{c.name}</span>
          <select className="itable-select" value={f.props[c.name] ?? ''} onChange={e => setF({ ...f, props: { ...f.props, [c.name]: e.target.value } })}>
            <option value="">any</option>{vals.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>) : null; })}
      {active && <div className="chips"><span className="muted small">{kept!.size} of {rows.length}</span><button type="button" className="linkish" onClick={() => setF({ ...EMPTY_FILTERS })}>clear filters</button></div>}
    </div>
  ) : null;
  return { toggle, bar, hide };
}

// A typed block (requirement, entity, rule, …): header with kind, id and status; the text is normal inline content.
const NodeBlock = createReactBlockSpec(
  { type: 'node', propSchema: { kind: { default: 'req' }, slug: { default: '' }, status: { default: '' }, form: { default: 'prose' }, textKey: { default: 'text' }, body: { default: '' }, extra: { default: '' }, check: { default: '' }, list: { default: '' }, row: { default: '' } }, content: 'inline' },
  {
    render: props => {
      const p = props.block.props as { kind: string; slug: string; status: string; form: string; body: string; extra: string; check: string; textKey: string; row: string };
      const set = (patch: Partial<typeof p>) => props.editor.updateBlock(props.block, { props: { ...p, ...patch } } as never);
      const ed = props.editor as unknown as EditorLike;
      if (p.row && p.row !== 'goal' && p.row !== 'task') return <TypeRowFor p={p} set={set} contentRef={props.contentRef} block={props.block as unknown as AnyBlock} editor={ed} />;
      if (p.row) return <RowNode p={p} set={set} contentRef={props.contentRef} block={props.block as unknown as AnyBlock} editor={ed} />;
      return <EditorCard p={p} set={set} contentRef={props.contentRef} block={props.block as unknown as AnyBlock} editor={ed} />;
    },
  },
);

// A card or a row shows none of the blocks under its node (req:wf2.ui.card-preview, rule:card-fold): a style element
// zero-heights them by the block's id (they stay blocks, and in the file) and a chip opens the details; the caret
// inside them (arrow keys) shows them while it is there.
// A question never folds: its content is its answer (decision:wf2.answer-is-content), shown under the card.
function useFold(block: AnyBlock, open: () => void, never = false) {
  const count = block.children?.length ?? 0;
  const [folded, setFolded] = useState(!never);
  const bn = useBlockNoteEditor();
  useEditorSelectionChange(() => {
    if (!count || never) return;
    // the editor's own selection, not the DOM's: a programmatic caret lands in the block before the DOM follows
    let cur: string | undefined; try { cur = (bn.getTextCursorPosition().block as { id?: string }).id; } catch { cur = undefined; }
    const under = (bs: AnyBlock[] | undefined): boolean => !!bs?.some(b => (b as { id?: string }).id === cur || under(b.children));
    setFolded(!(cur && under(block.children)));
  }, bn);
  const fold = count && !never ? { count, folded, open } : undefined;
  const hide = folded && count && !never ? <style>{`.bn-block-outer[data-id="${String((block as { id?: string }).id)}"] > .bn-block > .bn-block-group > .bn-block-outer { height: 0; min-height: 0; overflow: hidden; visibility: hidden; margin: 0; }`}</style> : null;
  return { fold, hide };
}

// The chip a folded row carries: how many blocks sit under it; a click opens the item's details.
function RowFold({ fold }: { fold?: { count: number; folded: boolean; open: () => void } }) {
  if (!fold) return null;
  return <button type="button" className={`nblock-fold nrow-fold ${fold.folded ? 'folded' : ''}`} contentEditable={false} title="Open the item: its content is in the details" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); fold.open(); }}>{fold.folded ? '▸' : '▾'} {fold.count}</button>;
}

// A card inside the editor: the block's inline content is the text; the header selects the block; links and sends
// come from the block's place in this document (component:node-cards).
function EditorCard({ p, set, contentRef, block, editor }: { p: CardP; set: (patch: Partial<CardP>) => void; contentRef: (el: HTMLElement | null) => void; block: AnyBlock; editor: EditorLike }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const id = `${p.kind}:${p.slug}`;
  const open = () => { if (p.slug) emit('wf:select', hostRef.current, id); };
  const { fold, hide } = useFold(block, open, p.kind === 'question');
  const bn = useBlockNoteEditor();
  const bid = String((block as { id?: string }).id);
  // a question's answer count follows the editor, not the render's block: the placeholder goes as soon as the first
  // block is there (the node view is not re-rendered for a change in its children)
  const [answered, setAnswered] = useState(block.children?.length ?? 0);
  useEditorChange(() => { if (p.kind === 'question') setAnswered(((editor.getBlock(bid) as AnyBlock | undefined)?.children ?? []).length); }, bn);
  // the first block of a question's answer: an empty paragraph under the question, the caret in it
  const startAnswer = () => {
    editor.updateBlock(block, { children: [{ type: 'paragraph', content: [] }] });
    const first = ((editor.getBlock(bid) as { children?: { id: string }[] } | undefined)?.children ?? [])[0];
    if (first) { editor.setTextCursorPosition(first.id, 'start'); bn.focus(); }
  };
  const host: CardHost = {
    text: cls => <div className={cls} ref={contentRef} />,
    // the pill selects like the rest of the card; the card's text places the caret and the onSelect below does the rest
    peek: () => { if (p.slug) emit('wf:select', hostRef.current, id); },
    copyLink: () => copyBlockLink(block, hostRef.current),
    send: () => sendBlock(block, hostRef.current),
    stop: stopEditorEvents,
    onHeadClick: p.kind === 'question' || p.kind === 'decision' ? undefined : selectBlockOnClick(editor, block, null),
    onSelect: open,
    hostRef, fold,
    answer: p.kind === 'question' ? { count: answered, start: startAnswer, open } : undefined,
  };
  return <>{hide}<NodeCard p={p} set={set} host={host} /></>;
}

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, node: NodeBlock(), drawing: DrawingBlock(), collection: CollectionBlock(), view: ViewBlock(), embed: EmbedBlock() }, inlineContentSpecs: { ...defaultInlineContentSpecs, tag: Tag, img: InlineImage } });

// Drag-handle menu entry on code blocks: turn an ASCII diagram into an editable drawing.
function ToDrawingItem({ convert }: { convert: (b: AnyBlock) => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: st => st?.block });
  if (!block || (block as { type: string }).type !== 'codeBlock') return null;
  return <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => convert(block as unknown as AnyBlock)}>Turn into drawing</Components.Generic.Menu.Item>;
}

// Drag-handle menu entry on image blocks: annotate the image in Excalidraw (shapes, labels, arrows on top of it).
function AnnotateItem({ annotate }: { annotate: (b: AnyBlock) => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: st => st?.block });
  if (!block || (block as { type: string }).type !== 'image') return null;
  return <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => annotate(block as unknown as AnyBlock)}>Annotate image</Components.Generic.Menu.Item>;
}

// "Ask": a command to an agent about the selected text, with the block and the page attached.
function AskAgentButton({ onRequest }: { onRequest: (r: Omit<AskRequest, 'doc' | 'project' | 'pageLink'>) => void }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  return (
    <Components.FormattingToolbar.Button className="bn-button" label="Ask an agent" mainTooltip="Send the selection with a command to a session (⇢)" onClick={() => {
      const sel = window.getSelection(); const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { left: 200, bottom: 200 };
      let block: AnyBlock | undefined; try { block = editor.getTextCursorPosition().block as unknown as AnyBlock; } catch { block = undefined; }
      const items = block && Array.isArray(block.content) ? block.content as { type: string; text?: string; props?: { id?: string }; href?: string; content?: { text?: string }[] }[] : [];
      const blockText = items.map(i => i.type === 'text' ? i.text ?? '' : i.type === 'link' ? (i.content ?? []).map(c => c.text ?? '').join('') : i.type === 'tag' ? i.props?.id ?? '' : '').join('');
      const refs = items.flatMap(i => i.type === 'tag' && i.props?.id ? [i.props.id] : i.type === 'link' && i.href && /^[a-z-]+:/.test(i.href) ? [i.href] : []);
      if (block?.type === 'node') { const np = block.props as unknown as { kind: string; slug: string }; refs.unshift(`${np.kind}:${np.slug}`); }
      onRequest({ selection: editor.getSelectedText(), blockText, blockLink: block ? blockLink(block, editor.domElement as HTMLElement | null) : '', refs, x: rect.left, y: rect.bottom + 8 });
    }}>⇢ ask</Components.FormattingToolbar.Button>
  );
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

// The ⌁ node picker (req:wf2.editor.entity-from-text): link the selection to a node, make a new document from it, or
// make a NEW NODE of a chosen type from it — "London" becomes city:london, its card on the type's home page (or this
// page for a base kind) and the word a tag — then offer to link every other plain "London" in the product.
// What making a node returned: its id and, for a typed instance, the document it went to.
type Made = { id: string; doc?: { href: string; title: string; created: boolean } };
function LinkNodePicker({ req, onClose, apply, createDoc, createNode, linkEverywhere }: { req: LinkRequest; onClose: () => void; apply: (id: string) => void; createDoc: (title: string) => Promise<string | null>; createNode: (type: string, title: string) => Promise<Made | null>; linkEverywhere: (text: string, id: string, docs: string[]) => Promise<number> }) {
  const { index, ownTypes, product } = usePeek();
  const [q, setQ] = useState(req.text.trim());
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState(ownTypes[0]?.slug ?? 'entity');
  // after a link: every other plain occurrence of the phrase, per document, and the offer to link them all
  const [after, setAfter] = useState<{ id: string; text: string; docs: { doc: string; project: string; title: string; count: number }[]; count: number; done?: number; went?: Made['doc'] } | null>(null);
  const hits = useMemo(() => { const n = q.trim().toLowerCase(); if (!n) return []; return Object.values(index).filter(e => e.id.toLowerCase().includes(n) || e.title.toLowerCase().includes(n)).slice(0, 8); }, [q, index]);
  const types = [...ownTypes.map(t => t.slug), ...['entity', 'value', 'person', 'team', 'goal', 'req', 'decision', 'question', 'task'].filter(k => !ownTypes.some(t => t.slug === k))];
  const linked = async (id: string, went?: Made['doc']) => {
    apply(id);
    // the rest of the product: where the same words are still plain
    const text = req.text.trim();
    if (text && text.length >= 2) { try { const r = await fetch(`/api/${product}/link-all?text=${encodeURIComponent(text)}&id=${encodeURIComponent(id)}`); const j = await r.json(); if (r.ok && j.count) { setAfter({ id, text, docs: j.docs, count: j.count, went }); return; } } catch { /* offer nothing */ } }
    // nothing else to link: a new instance still says where it went (req:ontology.instance-home), then the picker closes
    if (went) { setAfter({ id, text, docs: [], count: 0, done: 0, went }); setTimeout(onClose, 2400); return; }
    onClose();
  };
  const create = async () => { setBusy(true); const id = await createDoc(q.trim()); setBusy(false); if (id) linked(id); };
  const createTyped = async () => { setBusy(true); const made = await createNode(type, q.trim()); setBusy(false); if (made) linked(made.id, made.doc); };
  const all = async () => { if (!after) return; setBusy(true); const n = await linkEverywhere(after.text, after.id, after.docs.map(d => `${d.project}/${d.doc}`)); setBusy(false); setAfter({ ...after, done: n }); setTimeout(onClose, 1600); };
  if (after) return (
    <div className="linknode" style={{ left: Math.min(req.x, window.innerWidth - 360), top: req.y }}>
      <div className="linknode-sel">“{after.text}” → <code>{after.id}</code></div>
      {after.went && <p className="linknode-note">a row in <Link href={after.went.href}>{after.went.title}</Link>{after.went.created ? ` — new, the home of every ${after.id.split(':')[0]} from now on` : ''}</p>}
      {after.done === undefined ? <>
        <p className="linknode-note">{after.count} other plain “{after.text}” in {after.docs.length} document{after.docs.length === 1 ? '' : 's'}: {after.docs.slice(0, 5).map(d => `${d.title} (${d.count})`).join(', ')}{after.docs.length > 5 ? ', …' : ''}</p>
        <div className="sec-actions"><button className="pri" disabled={busy} onMouseDown={e => { e.preventDefault(); all(); }}>Link them all</button><button className="linkish" onMouseDown={e => { e.preventDefault(); onClose(); }}>Only this one</button></div>
      </> : after.count > 0 && <p className="linknode-note">linked {after.done} place{after.done === 1 ? '' : 's'} — the documents rebuild</p>}
    </div>
  );
  return (
    <div className="linknode" style={{ left: Math.min(req.x, window.innerWidth - 360), top: req.y }}>
      <div className="linknode-sel">link “{req.text || '…'}” to</div>
      <input autoFocus value={q} placeholder="search id or title, or a new document title…" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { if (hits[0]) linked(hits[0].id); else if (q.trim()) createTyped(); } if (e.key === 'Escape') onClose(); }} />
      <ul>
        {hits.map(h => <li key={h.id}><button onMouseDown={e => { e.preventDefault(); linked(h.id); }}><span>{h.id}</span><small>{h.title}</small></button></li>)}
        {q.trim() && <li className="linknode-new"><button className="create" disabled={busy} onMouseDown={e => { e.preventDefault(); createTyped(); }}><span>+ new <b>{type}</b> “{q.trim()}”</span><small>{type}:{q.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')} in {ownTypes.some(t => t.slug === type) ? `the ${type} collection document` : 'this document'}, and this word becomes its tag</small></button><select value={type} onMouseDown={e => e.stopPropagation()} onChange={e => setType(e.target.value)} title="the type of the new node">{types.map(t => <option key={t} value={t}>{t}</option>)}</select></li>}
        {q.trim() && <li><button className="create" disabled={busy} onMouseDown={e => { e.preventDefault(); create(); }}><span>+ new document “{q.trim()}”</span><small>creates a page under this one and links to it</small></button></li>}
      </ul>
    </div>
  );
}

// `scope`: the editor edits one node's content (decision:wf2.content-editor-scoped) — the blocks under its defining
// line in `slug` — loaded and saved through the node's content route instead of the document's; it publishes no
// editing context, and a click on a child block opens the child in the column (decision:ontology.depth-by-navigation).
export default function DocEditor({ product, project, slug, body, ifMatch, fallback, scope = null }: { product: string; project: string; slug: string; body: string; ifMatch: string; fallback?: ReactNode; scope?: string | null }) {
  const router = useRouter();
  const { open: openPeek, select, setFocused, index, hrefFor, setEditing, setShowContext, ownKinds, ownTypes } = usePeek();
  const scoped = scope !== null;
  // node blocks render inside the editor, so they ask for the column through an event that bubbles to this
  // container (emit): wf:peek pushes the node on the chip stack, wf:select selects it (the Context root shows it;
  // rule:block-select) — in a content editor a select opens the child instead, one level deeper
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const peek = (e: Event) => { e.stopPropagation(); openPeek((e as CustomEvent<string>).detail); };
    const sel = (e: Event) => { e.stopPropagation(); if (scoped) openPeek((e as CustomEvent<string>).detail); else select((e as CustomEvent<string>).detail); };
    el.addEventListener('wf:peek', peek); el.addEventListener('wf:select', sel);
    return () => { el.removeEventListener('wf:peek', peek); el.removeEventListener('wf:select', sel); };
  }, [openPeek, select, scoped]);
  // pasted or dropped images go to the project's docs/assets folder; the block keeps the relative url the markdown uses
  const uploadFile = async (file: File) => {
    const fd = new FormData(); fd.append('file', file, file.name || 'image.png');
    const r = await fetch(`/api/${product}/${project}/asset`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error('upload failed');
    return (await r.json()).url as string;
  };
  const editor = useCreateBlockNote({ schema, uploadFile,
    // an image pasted while the cursor is in a node block (a bug, a task, a requirement) goes into that block's text
    // as an inline image, not as an image block after it — the screenshot is part of the bug
    // (BlockNote cancels the browser's paste before calling this, so anything that is not ours must go to
    // defaultPasteHandler — returning undefined kills text paste everywhere, task:new-286)
    pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return defaultPasteHandler();
      const cur = ed.getTextCursorPosition().block as unknown as AnyBlock;
      if (cur.type !== 'node') return defaultPasteHandler();
      void insertInlineImages(files);
      return true;
    } });
  const insertInlineImages = async (files: File[]) => {
    for (const f of files) {
      try {
        const url = await uploadFile(f);
        editor.insertInlineContent([{ type: 'img', props: { url, alt: (f.name || 'image').replace(/\.[a-z0-9]+$/i, '') } }, ' '] as never);
        touched.current = true; changed();
      } catch { setLintMsg('could not upload the image'); }
    }
  };
  const imageInput = useRef<HTMLInputElement>(null);
  if (typeof window !== 'undefined' && scoped) (window as unknown as { __wfScoped: unknown }).__wfScoped = editor; // dev inspection
  if (typeof window !== 'undefined' && !scoped) { const w = window as unknown as { __wf: unknown; __wfExport: () => string; __wfLink: (id: string) => string }; w.__wf = editor; w.__wfExport = () => blocksToMarkdown(editor.document as unknown as AnyBlock[]); w.__wfLink = (id: string) => { const b = editor.getBlock(id) as unknown as AnyBlock; return `${location.origin}/${product}/${project}/d/${slug}#${blockAnchor(b)}`; }; } // dev inspection
  void index;
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const [lintMsg, setLintMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkReq, setLinkReq] = useState<LinkRequest | null>(null);
  const [askReq, setAskReq] = useState<AskRequest | null>(null);
  const hash = useRef(ifMatch);
  const lastExported = useRef<string | null>(null);
  const loading = useRef(false);
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the editor leaving the page (the document's file deleted outside the app, the page swapped for its not-found
  // notice) takes its pending save with it: edits never recreate a deleted file (decision:wf2.deleted-outside-drops-edits)
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const theme = useMemo(() => (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), []);

  // Publish the block under the cursor (its plain text and the ids it already carries) as the editing context for
  // the Context panel; the insert callback drops a tag at the current cursor position.
  const lastBlockId = useRef<string>('');
  const publishContext = () => {
    if (loading.current) return;
    let block: AnyBlock | undefined;
    try { block = editor.getTextCursorPosition().block as unknown as AnyBlock; } catch { block = undefined; }
    const bid = String((block as { id?: string } | undefined)?.id ?? '');
    // a block change while the editor has no focus (a reload after an outside change, a save from the column's content
    // editor) is not the person moving the caret: the selected node stays selected (rule:block-select)
    const active = typeof document !== 'undefined' && !!rootRef.current?.contains(document.activeElement);
    if (bid !== lastBlockId.current) { lastBlockId.current = bid; if (!scoped && active) setFocused(null); if (touched.current && !loading.current && settle(true)) changed(); }
    if (scoped) return; // a content editor never drives the Context root: the column shows its node already
    if (!block || !Array.isArray(block.content)) { setEditing(null); return; }
    const text = blockText(block as unknown as LinkBlock);
    const linked = blockLinked(block as unknown as LinkBlock);
    const np = block.type === 'node' ? block.props as unknown as { kind: string; slug: string } : null;
    setEditing({ docSlug: slug, blockId: String((block as { id?: string }).id ?? ''), text, linked, nodeId: np && np.slug ? `${np.kind}:${np.slug}` : undefined, insert: (id: string) => {
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
  useEffect(() => { const h = () => publishContext(); window.addEventListener('wf:publish', h); return () => window.removeEventListener('wf:publish', h); }); // eslint-disable-line react-hooks/exhaustive-deps
  // The context column is always there on a document page; it leaves with the editor.
  useEffect(() => { if (scoped) return; setShowContext(true); return () => { setEditing(null); setShowContext(false); }; }, [setEditing, setShowContext, scoped]);

  // ids already used in this product (so a new row never collides)
  const settle = (assignSlugs = false) => { const taken = new Set(Object.keys(index)); for (const b of editor.document as unknown as AnyBlock[]) for (const k of b.children ?? []) if (k.type === 'node') { const p = k.props as unknown as { kind: string; slug: string }; if (p.slug) taken.add(`${p.kind}:${p.slug}`); } return settleCollections(editor as never, taken, assignSlugs); };
  const load = (md: string) => {
    loading.current = true;
    try {
      // every level of content goes through the same prepare → parse → expand (req:ontology.content)
      const blocks = importMarkdown(md, src => editor.tryParseMarkdownToBlocks(src) as unknown as AnyBlock[]);
      editor.replaceBlocks(editor.document, (blocks.length ? blocks : [{ type: 'paragraph', content: [] }]) as never);
      settle();
      judged.current = new Map((editor.document as unknown as LinkBlock[]).map(b => [String(b.id), blockText(b)]));
      lastExported.current = blocksToMarkdown(editor.document as unknown as AnyBlock[]);
      const shrink = lastExported.current.replace(/\s+/g, '').length / Math.max(1, md.replace(/\s+/g, '').length);
      if (md.trim() && shrink < 0.9) throw new Error(`the editor could not represent this document faithfully (${Math.round(shrink * 100)}% of the text survived import)`);
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
    if (timer.current) return; // the person is mid-edit: their save goes out first, the next refresh brings the merge
    load(body);
    if (!ready) setReady(true);
    // a link to a block: find it by anchor and bring it into view
    const frag = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
    if (frag) setTimeout(() => {
      const target = (editor.document as unknown as AnyBlock[]).flatMap(b => [b, ...(b.children ?? [])]).find(b => blockAnchor(b) === frag || (frag.startsWith('n-') && b.type === 'node' && blockAnchor(b) === frag));
      const el = target ? (document.querySelector(`[data-id="${String((target as { id?: string }).id)}"]`) as HTMLElement | null) : null;
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2000); }
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, body, ifMatch]);

  async function save(md: string) {
    setState('saving');
    // scoped: the first block is the node's text, the rest its content (decision:wf2.text-is-first-block)
    const split = () => { const blocks = editor.document as unknown as AnyBlock[]; const first = blocks[0]; const text = first && Array.isArray(first.content) ? inlineToMarkdown(first.content as Inline[]) : ''; return { text, content: blocksToMarkdown(blocks.slice(1)) }; };
    const r = scoped
      ? await fetch(`/api/${product}/node/${encodeURIComponent(scope)}/content`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...split(), ifMatch: hash.current }) })
      : await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-body', ifMatch: hash.current, body: md }) });
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
      if (!scoped && before > 200 && after < before / 2) { setState('error'); setLintMsg('refused: this change would remove more than half of the document; reload if that was not intended'); return; }
      lastExported.current = md; save(md);
    }, 700);
  };
  // Links Jev is sure of, applied on leaving the editor (Jev auto-linking design §3): the blocks whose text changed
  // since the last judgement go to /links; the ids come back as tags / related-to through applyLinks, then the save.
  // The server never writes into an open document (the autosave's ifMatch would conflict), so this happens here.
  const judged = useRef<Map<string, string>>(new Map()); // block id → its text when last judged (or loaded)
  const autoLink = async () => {
    if (scoped) return;
    const blocks = editor.document as unknown as LinkBlock[];
    const stale = blocks.filter(b => b.id && blockText(b).trim().length >= 12 && judged.current.get(String(b.id)) !== blockText(b));
    if (!stale.length) return;
    for (const b of stale) judged.current.set(String(b.id), blockText(b));
    let links: Record<string, string[]> = {};
    try { const r = await fetch(`/api/${product}/links`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blocks: stale.map(b => ({ key: String(b.id), text: blockText(b), linked: blockLinked(b) })) }) }); links = (await r.json()).links ?? {}; } catch { return; }
    if (!Object.keys(links).length) return;
    const r = applyLinks(editor.document as unknown as LinkBlock[], links); if (!r.changed) return;
    loading.current = true; editor.replaceBlocks(editor.document, r.blocks as never); loading.current = false;
    for (const b of r.blocks) if (b.id && links[b.id]) judged.current.set(String(b.id), blockText(b));
    touched.current = true; changed(); publishContext();
  };
  // On leaving the editor: ids typed as text become tags and a paragraph that starts with an id becomes a node block;
  // then the changed blocks are linked.
  const retag = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (settle(true)) changed();
    const before = JSON.stringify(editor.document);
    const after = expand(editor.document as unknown as AnyBlock[], []);
    if (JSON.stringify(after) !== before) {
      loading.current = true; editor.replaceBlocks(editor.document, after as never); loading.current = false;
      changed(); // the converted blocks may serialise differently (aliases expanded, node lines); save that
    }
    void autoLink();
  };
  const createDoc = async (title: string): Promise<string | null> => {
    const r = await fetch(`/api/${product}/${project}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, template: 'blank', parent: slug }) });
    const j = await r.json();
    if (!r.ok) { setLintMsg(`could not create document: ${j.message ?? j.error}`); return null; }
    router.refresh();
    return j.node as string;
  };
  // a new node of a type from the selection (req:wf2.editor.entity-from-text): a row in the type's collection document
  // (decision:ontology.collection-document — the route says which, so the picker can tell the person), or a card on
  // this page for a base kind (the route takes `home`)
  const createNode = async (type: string, title: string): Promise<Made | null> => {
    const idSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!idSlug) return null;
    const r = await fetch(`/api/${product}/types/${type}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: idSlug, title, home: `${project}/${slug}` }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) return { id: `${type}:${idSlug}` };
    if (!r.ok) { setLintMsg(`could not create ${type}: ${j.message ?? j.error}`); return null; }
    if (j.doc && !(j.doc.project === project && j.doc.doc === slug)) router.refresh(); // a new document in the rail
    return { id: j.id as string, doc: j.doc ? { href: `/${product}/${j.doc.project}/d/${j.doc.doc}`, title: j.doc.title, created: !!j.created } : undefined };
  };
  // every other plain occurrence in the product, this document included: the pending save goes first, the bulk
  // rewrite follows, and the editor takes the new body from disk like any external change
  const linkEverywhere = async (text: string, id: string, docs: string[]): Promise<number> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; const md = blocksToMarkdown(editor.document as unknown as AnyBlock[]); if (lastExported.current !== null && norm(md) !== norm(lastExported.current)) { lastExported.current = md; await save(md); } }
    const r = await fetch(`/api/${product}/link-all`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, id, docs }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setLintMsg(`could not link everywhere: ${j.message ?? j.error}`); return 0; }
    lastExported.current = null; // the document changed on disk under us: the next refresh reloads it
    router.refresh();
    return j.count as number;
  };
  const applyLink = (id: string) => {
    if (!linkReq) return;
    // Restore the captured range (typing in the picker collapsed it), then use BlockNote's own createLink so the
    // block's inline content stays consistent (a raw ProseMirror mark breaks BlockNote's block conversion).
    const tt = (editor as unknown as { _tiptapEditor: { view: { focus: () => void }; commands: { setTextSelection: (r: { from: number; to: number }) => boolean } } })._tiptapEditor;
    tt.view.focus();
    tt.commands.setTextSelection({ from: linkReq.from, to: linkReq.to });
    editor.createLink(id, linkReq.text || id);
    touched.current = true; changed();
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
  // base kinds, then the product's own types (its type: cards) — an instance is a prose line `team:slug …`
  const nodeItems = [...CARD_KINDS, ...ownKinds].map(kind => ({
    title: `${kind} block`, group: 'Wye', subtext: `a new ${kind} written as prose`,
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
  // Images: the image becomes the locked canvas of a drawing; annotations (shapes, labels, arrows) go on top and are
  // exported as PNG + text for agents (rule:image-annotations). The markdown link changes to the drawing; the asset stays.
  const imageToDrawing = async (cur: AnyBlock) => {
    const url = (cur.props as { url?: string; caption?: string }).url; if (!url) { setLintMsg('the image has no file yet'); return; }
    const slug = newDrawingSlug();
    setLintMsg('preparing the annotation canvas…');
    const ok = await sceneFromImage(product, project, slug, url).catch(() => false);
    if (!ok) { setLintMsg('could not create the annotation drawing'); return; }
    setLintMsg(null);
    const src = `drawings/${slug}.excalidraw`;
    editor.replaceBlocks([cur as never], [{ type: 'drawing', props: { src, title: (cur.props as { caption?: string }).caption || 'Annotated image' } } as never]);
    touched.current = true; changed();
    setTimeout(() => window.dispatchEvent(new CustomEvent('wf:drawing-edit', { detail: src })), 300);
  };
  if (typeof window !== 'undefined') (window as unknown as { __wfAnnotate: (id: string) => void }).__wfAnnotate = (id: string) => { const b = editor.getBlock(id) as unknown as AnyBlock | undefined; if (b) imageToDrawing(b); };
  if (typeof window !== 'undefined') (window as unknown as { __wfCodeToDrawing: (id: string) => void }).__wfCodeToDrawing = (id: string) => { const b = editor.getBlock(id) as unknown as AnyBlock | undefined; if (b) codeToDrawing(b); }; // dev inspection
  const insertCollection = (kind: string, view = 'table') => { insertOrUpdateBlockForSlashMenu(editor, { type: 'collection', props: { kind, view }, children: [emptyRow(kind, view)] } as never); setTimeout(() => settle(), 0); touched.current = true; changed(); };
  // one Table block: goals, tasks or any of the product's types — the type is picked in the table's header
  const collectionItems = [{
    title: 'Data table', group: 'Wye', subtext: `a table of goals, tasks${ownTypes.length ? ', ' + ownTypes.map(t => pluralTitle(t).toLowerCase()).join(', ') : ''} — pick the type in its header; rows are nodes`,
    onItemClick: () => insertCollection('task'),
  }, {
    // the same block as a list: its rows are ordinary blocks, Enter adds one of the same kind, the filter bar on top (rule:list-view)
    title: 'Data list', group: 'Wye', aliases: ['list', 'blocks', 'view'], subtext: `tasks, goals${ownTypes.length ? ', ' + ownTypes.map(t => pluralTitle(t).toLowerCase()).join(', ') : ''} shown as blocks with a filter on top — a new block is one of the same kind`,
    onItemClick: () => insertCollection('task', 'list'),
  }, {
    title: 'Instances view', group: 'Wye', subtext: 'a live, filterable list of every node of one type — pages, tasks, ' + (ownTypes[0]?.slug ?? 'decisions') + 's… — nothing is stored but the filters',
    onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'view', props: { slug: ownTypes[0]?.slug ?? 'task', query: '' } } as never); touched.current = true; changed(); },
  }, {
    // an embed (req:wf2.embeds.insert): the block opens a picker; the id is set when a node is chosen
    title: 'Embed a node', group: 'Wye', aliases: ['ref', 'embed', 'reference', 'transclude'], subtext: 'show a block from any page here — its card, editable; one source, every embed follows',
    onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'embed', props: { node: '' } } as never); touched.current = true; },
  }];
  const drawingItems = [
    { title: 'Drawing', group: 'Wye', subtext: 'an Excalidraw sketch saved next to the document', onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'drawing', props: { src: `drawings/${newDrawingSlug()}.excalidraw`, title: 'Drawing' } } as never); touched.current = true; changed(); } },
    { title: 'Code block → drawing', group: 'Wye', subtext: 'turn this ASCII diagram into an editable drawing', onItemClick: () => codeToDrawing(editor.getTextCursorPosition().block as unknown as AnyBlock) },
  ];

  if (loadError) return <div className="doc-editor"><p className="notice">Editing is off for this document: {loadError}. The text below is read-only.</p>{fallback}</div>;
  return (
    <EditorScope.Provider value={scope}>
    <div className={`doc-editor ${scoped ? 'scoped' : ''}`} ref={rootRef} data-product={product} data-project={project} data-doc={slug} data-scope={scope ?? undefined} onBlur={retag} onFocus={() => { touched.current = true; }}
      onClick={e => { // a link whose target is a node id opens the peek panel instead of navigating
        const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
        const href = a?.getAttribute('href') ?? '';
        if (a && !a.classList.contains('tag') && new RegExp('^' + ID_RE.source + '$').test(href)) {
          e.preventDefault();
          const doc = index[href]?.doc && (e.metaKey || e.ctrlKey) ? hrefFor(href) : null; // ⌘-click opens the document, a click peeks
          if (doc) router.push(doc.replace(/#.*$/, '')); else openPeek(href);
        }
      }}>
      <div className="doc-editor-bar"><span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'conflict' ? 'changed on disk — reload' : state === 'error' ? 'save failed' : ready ? 'live' : 'loading…'}</span>{lintMsg && <span className="notice">Lint: {lintMsg}</span>}</div>
      <BlockNoteView editor={editor} theme={theme} onChange={changed} formattingToolbar={false} slashMenu={false} sideMenu={false}>
        <SideMenuController sideMenu={p => <SideMenu {...p} dragHandleMenu={() => <DragHandleMenu><RemoveBlockItem>Delete</RemoveBlockItem><BlockColorsItem>Colors</BlockColorsItem><ToDrawingItem convert={codeToDrawing} /><AnnotateItem annotate={imageToDrawing} /><CopyLinkItem /><SendToAgentItem /></DragHandleMenu>} />} />
        <FormattingToolbarController formattingToolbar={() => <FormattingToolbar>{...getFormattingToolbarItems()}<LinkNodeButton onRequest={setLinkReq} /><AskAgentButton onRequest={r => setAskReq({ ...r, doc: slug, project, pageLink: `${location.origin}/${product}/${project}/d/${slug}`, refs: [...new Set([...r.refs, `module:${slug}`])] })} /></FormattingToolbar>} />
        <SuggestionMenuController triggerCharacter="/" getItems={async q => {
          // "Image in this block": a file picked from disk goes into the current node block's text (paste does the same)
          let inNode = false; try { inNode = (editor.getTextCursorPosition().block as unknown as AnyBlock).type === 'node'; } catch { /* no cursor */ }
          const imageItems = inNode ? [{ title: 'Image in this block', group: 'Wye', subtext: 'a screenshot inside this bug / task / requirement, as part of its text', onItemClick: () => imageInput.current?.click() }] : [];
          return filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...imageItems, ...nodeItems, ...collectionItems, ...drawingItems], q);
        }} />
        <SuggestionMenuController triggerCharacter="@" minQueryLength={1} getItems={async q => mentionItems(q)} />
      </BlockNoteView>
      <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void insertInlineImages(fs); }} />
      {linkReq && <LinkNodePicker req={linkReq} onClose={() => setLinkReq(null)} apply={applyLink} createDoc={createDoc} createNode={createNode} linkEverywhere={linkEverywhere} />}
      {askReq && <AskAgentBox req={askReq} onClose={() => setAskReq(null)} />}
    </div>
    </EditorScope.Provider>
  );
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
