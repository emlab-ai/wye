'use client';
import { useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent } from 'react';
import { BlockNoteSchema, defaultInlineContentSpecs } from '@blocknote/core';
import { useCreateBlockNote, createReactInlineContentSpec } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { unwrapParagraphs, tagifyBlocks } from '@/lib/mdflow';
import { SmartTag } from './SmartTag';

// A kind:slug id as inline content: clickable tag in the editor, plain id text when exported to markdown.
const Tag = createReactInlineContentSpec(
  { type: 'tag', propSchema: { id: { default: '' } }, content: 'none' },
  {
    render: props => <SmartTag id={props.inlineContent.props.id} />,
    toExternalHTML: props => <span>{props.inlineContent.props.id}</span>,
  },
);
const schema = BlockNoteSchema.create({ inlineContentSpecs: { ...defaultInlineContentSpecs, tag: Tag } });

// Always-on editor for one prose section. Loads markdown (unwrapped, ids tagged), reports every change as
// markdown after a short debounce, and reloads only when the incoming markdown is not what it last exported.
export default function BlockEditor({ markdown, onMarkdown, onReady, debounceMs = 700 }: { markdown: string; onMarkdown: (md: string) => void; onReady?: () => void; debounceMs?: number }) {
  const editor = useCreateBlockNote({ schema });
  const [ready, setReady] = useState(false);
  const lastExported = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = useRef(false);      // true while we replace blocks programmatically
  const touched = useRef(false);      // true once the user has focused the editor; nothing saves before that
  const theme = useMemo(() => (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), []);

  useEffect(() => {
    if (lastExported.current !== null && normalise(lastExported.current) === normalise(markdown)) return;
    loading.current = true;
    const blocks = tagifyBlocks(editor.tryParseMarkdownToBlocks(unwrapParagraphs(markdown)) as never[]);
    editor.replaceBlocks(editor.document, blocks as never);
    lastExported.current = exportMd(editor);
    loading.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!ready) { setReady(true); onReady?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, markdown]);

  const changed = () => {
    if (loading.current || !touched.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const md = exportMd(editor);
      if (normalise(md) === normalise(lastExported.current ?? '')) return;
      lastExported.current = md;
      onMarkdown(md);
    }, debounceMs);
  };

  // When focus leaves, turn any id typed as plain text into a tag (rebuilding blocks moves the cursor, so not while typing).
  const retag = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; // focus moved inside the editor
    const before = JSON.stringify(editor.document);
    const after = tagifyBlocks(editor.document as never[]);
    if (JSON.stringify(after) === before) return;
    loading.current = true; editor.replaceBlocks(editor.document, after as never); loading.current = false;
  };

  return (
    <div className="bn-wrap" data-ready={ready} onBlur={retag} onFocus={() => { touched.current = true; }}>
      <BlockNoteView editor={editor} theme={theme} onChange={changed} />
    </div>
  );
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
// BlockNote's markdown export; empty table rows it invents on import are dropped.
function exportMd(editor: { blocksToMarkdownLossy: () => string }): string {
  return editor.blocksToMarkdownLossy().split('\n').filter(l => !/^\|(\s*\|)+\s*$/.test(l)).join('\n');
}
