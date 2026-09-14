'use client';
import { useEffect, useMemo, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';

// Client-only BlockNote wrapper: loads a markdown string, exposes the current markdown through onChange.
export default function BlockEditor({ markdown, onMarkdown }: { markdown: string; onMarkdown: (md: string) => void }) {
  const editor = useCreateBlockNote();
  const [ready, setReady] = useState(false);
  const theme = useMemo(() => (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), []);
  useEffect(() => {
    const blocks = editor.tryParseMarkdownToBlocks(markdown);
    editor.replaceBlocks(editor.document, blocks);
    setReady(true);
  }, [editor, markdown]);
  return (
    <div className="bn-wrap" data-ready={ready}>
      <BlockNoteView editor={editor} theme={theme} onChange={() => onMarkdown(editor.blocksToMarkdownLossy(editor.document))} />
    </div>
  );
}
