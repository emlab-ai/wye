'use client';
import { useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { useCreateBlockNote, createReactInlineContentSpec, createReactBlockSpec, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems, SuggestionMenuController, getDefaultReactSlashMenuItems, useBlockNoteEditor, useComponentsContext } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { prepare, expand } from '@/lib/import';
import { blocksToMarkdown, type AnyBlock } from '@/lib/serialize';
import { CARD_KINDS } from '@/lib/kinds';
import { SmartTag } from './SmartTag';
import { usePeek } from './PeekProvider';
import { ID_RE } from '@/lib/ids';

const STATUSES = ['', 'proposed', 'approved', 'unverified', 'api-only', 'shipped', 'deprecated', 'question', 'done', 'in-progress', 'blocked'];

// kind:slug as inline content: a clickable tag in the editor, plain id text when serialised.
const Tag = createReactInlineContentSpec(
  { type: 'tag', propSchema: { id: { default: '' } }, content: 'none' },
  { render: props => <SmartTag id={props.inlineContent.props.id} />, toExternalHTML: props => <span>{props.inlineContent.props.id}</span> },
);

// A typed block (requirement, entity, rule, …): header with kind, id and status; the text is normal inline content.
const NodeBlock = createReactBlockSpec(
  { type: 'node', propSchema: { kind: { default: 'req' }, slug: { default: '' }, status: { default: '' }, form: { default: 'prose' }, textKey: { default: 'text' }, body: { default: '' }, extra: { default: '' } }, content: 'inline' },
  {
    render: props => {
      const p = props.block.props as { kind: string; slug: string; status: string; form: string; body: string; extra: string };
      const [showYaml, setShowYaml] = useState(false);
      const set = (patch: Partial<typeof p>) => props.editor.updateBlock(props.block, { props: { ...p, ...patch } } as never);
      return (
        <div className={`nblock k-${p.kind}`} data-id={`${p.kind}:${p.slug}`}>
          <div className="nblock-head" contentEditable={false}>
            <span className="pill k" style={{ background: `var(--k-${p.kind}, var(--k-other))` }}>{p.kind}</span>
            <input className="nblock-slug" value={p.slug} spellCheck={false} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />
            <select className="status-sel" value={p.status} onChange={e => set({ status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
            {p.form === 'yaml' && <button className="mini" onClick={() => setShowYaml(v => !v)}>{showYaml ? 'hide yaml' : 'yaml'}</button>}
            {p.form === 'prose' && <input className="nblock-extra" value={p.extra} placeholder="key: value, key: value" onChange={e => set({ extra: e.target.value })} />}
          </div>
          <div className="nblock-text" ref={props.contentRef} />
          {showYaml && p.form === 'yaml' && <textarea className="nblock-yaml" contentEditable={false} value={p.body} rows={Math.min(24, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />}
        </div>
      );
    },
  },
);

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, node: NodeBlock() }, inlineContentSpecs: { ...defaultInlineContentSpecs, tag: Tag } });

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

function LinkNodePicker({ req, onClose, apply }: { req: LinkRequest; onClose: () => void; apply: (id: string) => void }) {
  const { index } = usePeek();
  const [q, setQ] = useState('');
  const hits = useMemo(() => { const n = q.trim().toLowerCase(); if (!n) return []; return Object.values(index).filter(e => e.id.toLowerCase().includes(n) || e.title.toLowerCase().includes(n)).slice(0, 8); }, [q, index]);
  return (
    <div className="linknode" style={{ left: Math.min(req.x, window.innerWidth - 360), top: req.y }}>
      <div className="linknode-sel">link “{req.text || '…'}” to</div>
      <input autoFocus value={q} placeholder="search id or title…" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && hits[0]) apply(hits[0].id); if (e.key === 'Escape') onClose(); }} />
      <ul>{hits.map(h => <li key={h.id}><button onMouseDown={e => { e.preventDefault(); apply(h.id); }}><span>{h.id}</span><small>{h.title}</small></button></li>)}</ul>
    </div>
  );
}

export default function DocEditor({ project, slug, body, ifMatch, fallback }: { project: string; slug: string; body: string; ifMatch: string; fallback?: ReactNode }) {
  const router = useRouter();
  const { open: openPeek } = usePeek();
  const editor = useCreateBlockNote({ schema });
  if (typeof window !== 'undefined') { const w = window as unknown as { __wf: unknown; __wfExport: () => string }; w.__wf = editor; w.__wfExport = () => blocksToMarkdown(editor.document as unknown as AnyBlock[]); } // dev inspection
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

  const load = (md: string) => {
    loading.current = true;
    try {
      const { md: prepared, yaml } = prepare(md);
      const parsed = editor.tryParseMarkdownToBlocks(prepared) as unknown as AnyBlock[];
      const blocks = expand(parsed, yaml);
      editor.replaceBlocks(editor.document, blocks as never);
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
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-body', ifMatch: hash.current, body: md }) });
    const j = await r.json();
    if (!r.ok) { setState(j.error === 'conflict' ? 'conflict' : 'error'); return; }
    hash.current = j.bodyHash ?? hash.current;
    setLintMsg(j.lintOk ? null : (j.lintErrors as string[]).join(' · '));
    setState('saved'); router.refresh();
  }
  const changed = () => {
    if (loading.current || !touched.current || lastExported.current === null) return;
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
    const before = JSON.stringify(editor.document);
    const after = expand(editor.document as unknown as AnyBlock[], []);
    if (JSON.stringify(after) === before) return;
    loading.current = true; editor.replaceBlocks(editor.document, after as never); loading.current = false;
    changed(); // the converted blocks may serialise differently (aliases expanded, node lines); save that
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
  const nodeItems = CARD_KINDS.map(kind => ({
    title: `${kind} block`, group: 'Waterfall', subtext: `a new ${kind} written as prose`,
    onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'node', props: { kind, slug: `new-${Math.floor(Math.random() * 900 + 100)}`, form: 'prose', textKey: 'text' } } as never); },
  }));

  if (loadError) return <div className="doc-editor"><p className="notice">Editing is off for this document: {loadError}. The text below is read-only.</p>{fallback}</div>;
  return (
    <div className="doc-editor" onBlur={retag} onFocus={() => { touched.current = true; }}
      onClick={e => { // a link whose target is a node id opens the peek panel instead of navigating
        const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
        const href = a?.getAttribute('href') ?? '';
        if (a && !a.classList.contains('tag') && new RegExp('^' + ID_RE.source + '$').test(href)) { e.preventDefault(); openPeek(href); }
      }}>
      <div className="doc-editor-bar"><span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'conflict' ? 'changed on disk — reload' : state === 'error' ? 'save failed' : ready ? 'live' : 'loading…'}</span>{lintMsg && <span className="notice">Lint: {lintMsg}</span>}</div>
      <BlockNoteView editor={editor} theme={theme} onChange={changed} formattingToolbar={false} slashMenu={false}>
        <FormattingToolbarController formattingToolbar={() => <FormattingToolbar>{...getFormattingToolbarItems()}<LinkNodeButton onRequest={setLinkReq} /></FormattingToolbar>} />
        <SuggestionMenuController triggerCharacter="/" getItems={async q => filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...nodeItems], q)} />
      </BlockNoteView>
      {linkReq && <LinkNodePicker req={linkReq} onClose={() => setLinkReq(null)} apply={applyLink} />}
    </div>
  );
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
