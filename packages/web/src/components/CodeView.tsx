'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { usePeek } from './PeekProvider';

// A file of the product's code in the column (req:wf2.code-preview): Monaco — the open-source VS Code editor — read
// only, the language by extension, the line a `#symbol` or `:line` names revealed and lit. The file is fetched from
// op:api.code, which keeps every path inside the product's code folder. The editor comes from the npm package (no CDN),
// so it works offline and in the desktop app; the language workers are not started — highlighting is enough here.
export const MonacoEditor = dynamic(async () => {
  const w = self as unknown as { MonacoEnvironment?: { getWorker: () => Worker } };
  w.MonacoEnvironment ??= { getWorker: () => new Worker(URL.createObjectURL(new Blob(['self.onmessage=()=>{}'], { type: 'text/javascript' }))) };
  const [{ default: Editor, loader }, monaco] = await Promise.all([import('@monaco-editor/react'), import('monaco-editor')]);
  loader.config({ monaco });
  // the TypeScript / JavaScript language service would need its worker; highlighting alone does not
  const ts = (monaco as unknown as { typescript?: { typescriptDefaults: { setDiagnosticsOptions: (o: object) => void; setEagerModelSync?: (v: boolean) => void }; javascriptDefaults: { setDiagnosticsOptions: (o: object) => void } } }).typescript;
  ts?.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true });
  ts?.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true });
  return Editor;
}, { ssr: false, loading: () => <p className="muted" style={{ padding: 12 }}>Loading the editor…</p> });

type Code = { root: string; path: string; language: string; text: string; line: number; size: number; mtime: string };

export function CodeView({ file }: { file: string }) {
  const { product } = usePeek();
  const [code, setCode] = useState<Code | null>(null); const [err, setErr] = useState('');
  const editorRef = useRef<{ revealLineInCenter: (n: number) => void; setPosition: (p: { lineNumber: number; column: number }) => void; createDecorationsCollection: (d: unknown[]) => unknown } | null>(null);
  useEffect(() => {
    let live = true; setCode(null); setErr('');
    fetch(`/api/${product}/code?path=${encodeURIComponent(file)}`).then(async r => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.message ?? j.error); else setCode(j); }).catch(e => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [file, product]);
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const onMount = (ed: unknown) => {
    const e = ed as NonNullable<typeof editorRef.current>; editorRef.current = e;
    const line = code?.line; if (!line) return;
    // after the first layout, so the reveal and the lit line land on the laid-out model
    setTimeout(() => { e.revealLineInCenter(line); e.setPosition({ lineNumber: line, column: 1 }); e.createDecorationsCollection([{ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: { isWholeLine: true, className: 'code-line-lit', linesDecorationsClassName: 'code-line-lit-gutter' } }]); }, 60);
  };
  if (err) return <div className="code-view"><p className="notice">{err}</p></div>;
  if (!code) return <div className="code-view"><p className="muted" style={{ padding: 12 }}>Loading {file}…</p></div>;
  return (
    <div className="code-view">
      <div className="code-head"><code>{code.path}</code><span className="muted">{code.language} · {Math.round(code.size / 1024) || 1} KB{code.line ? ` · line ${code.line}` : ''}</span></div>
      <MonacoEditor height="100%" language={code.language} value={code.text} theme={dark ? 'vs-dark' : 'vs'} onMount={onMount} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'off', renderLineHighlight: 'line', automaticLayout: true, folding: true, contextmenu: false }} />
    </div>
  );
}
