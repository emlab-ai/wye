'use client';
import { useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { MonacoEditor } from './CodeView';
import { useDark } from '@/lib/theme';

// A code block is Monaco — the editor the column shows files in (req:wf2.editor.code-monaco): highlighting by
// language, a language picker on hover, the height following the lines. The code lives in the block's `code` prop
// (the default block kept it as inline text; lib/serialize and lib/import read both), so the markdown is the same
// ``` fence as before.
const LANGS = ['', 'javascript', 'typescript', 'tsx', 'json', 'yaml', 'markdown', 'shell', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'sql', 'html', 'css', 'xml', 'toml', 'dockerfile', 'text'];
const ALIAS: Record<string, string> = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', md: 'markdown', py: 'python', rs: 'rust', kt: 'kotlin', txt: 'text', plaintext: 'text', '': 'text' };
const monacoLang = (l: string) => ALIAS[l] ?? l;
const LINE = 19, PAD = 16;

function CodeBlockView({ code, language, editable, onCode, onLanguage }: { code: string; language: string; editable: boolean; onCode: (v: string) => void; onLanguage: (v: string) => void }) {
  const dark = useDark();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lines, setLines] = useState(Math.max(3, code.split('\n').length));
  const height = Math.min(600, lines * LINE + PAD);
  return (
    <div className="code-block" data-lang={language}>
      <select className="code-lang" value={language} onChange={e => onLanguage(e.target.value)} title="Language" contentEditable={false}>{LANGS.map(l => <option key={l} value={l}>{l || 'plain'}</option>)}</select>
      <MonacoEditor height={height} language={monacoLang(language)} value={code} theme={dark ? 'vs-dark' : 'vs'}
        onChange={v => { const next = v ?? ''; setLines(Math.max(3, next.split('\n').length)); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onCode(next), 250); }}
        options={{ readOnly: !editable, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'off', glyphMargin: false, folding: false, lineDecorationsWidth: 8, lineNumbersMinChars: 0, scrollBeyondLastLine: false, scrollbar: { vertical: 'hidden', horizontal: 'auto', alwaysConsumeMouseWheel: false }, overviewRulerLanes: 0, hideCursorInOverviewRuler: true, renderLineHighlight: 'none', wordWrap: 'off', automaticLayout: true, contextmenu: false, padding: { top: 8, bottom: 8 }, tabSize: 2, quickSuggestions: false, suggestOnTriggerCharacters: false, parameterHints: { enabled: false }, hover: { enabled: false } } as never} />
    </div>
  );
}

// The block spec, in place of BlockNote's codeBlock (same type name, so every slash item, shortcut and serializer
// path still says `codeBlock`). `code` holds the text; `language` the fence's info string.
export const CodeBlock = createReactBlockSpec(
  { type: 'codeBlock', propSchema: { language: { default: '' }, code: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => {
      const p = block.props as { language: string; code: string };
      return <CodeBlockView code={p.code} language={p.language} editable={editor.isEditable}
        onCode={v => { if (v !== p.code) editor.updateBlock(block, { props: { ...block.props, code: v } }); }}
        onLanguage={v => editor.updateBlock(block, { props: { ...block.props, language: v } })} />;
    },
    // what the clipboard and the markdown export see
    toExternalHTML: ({ block }) => { const p = block.props as { language: string; code: string }; return <pre><code className={p.language ? `language-${p.language}` : undefined}>{p.code}</code></pre>; },
    parse: el => { if (el.tagName !== 'PRE') return undefined; const c = el.querySelector('code'); const lang = c?.getAttribute('data-language') || (c?.className.match(/language-([\w-]+)/) ?? [])[1] || el.getAttribute('data-language') || ''; return { language: lang, code: (c ?? el).textContent ?? '' }; },
  },
);
