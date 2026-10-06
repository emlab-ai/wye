'use client';
import { useEffect, useState } from 'react';
import { MonacoEditor } from './CodeView';
import { useDark } from '@/lib/theme';

// A file of the open folder in the content column (req:wf2.workspace-files): the code view — Monaco, read only, the
// language by extension — as the one thing on the page. A binary file or one too large says so instead.
type File = { root: string; path: string; language?: string; text?: string; size: number; mtime: string; binary?: boolean; large?: boolean };
const kb = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function FileView({ product, file }: { product: string; file: string }) {
  const [f, setF] = useState<File | null>(null); const [err, setErr] = useState('');
  const dark = useDark();
  useEffect(() => {
    let live = true; setF(null); setErr('');
    fetch(`/api/workspace/files?${product ? `product=${encodeURIComponent(product)}&` : ''}path=${encodeURIComponent(file)}`).then(async r => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.message ?? j.error); else setF(j); }).catch(e => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [file, product]);
  if (err) return <div className="code-view page-file"><div className="code-head"><code>{file}</code></div><p className="notice" style={{ margin: 12 }}>{err}</p></div>;
  if (!f) return <div className="code-view page-file"><p className="muted" style={{ padding: 12 }}>Loading {file}…</p></div>;
  return (
    <div className="code-view page-file">
      <div className="code-head"><code>{f.path}</code><span className="muted">{f.language ? `${f.language} · ` : ''}{kb(f.size)} · read only</span></div>
      {f.text === undefined
        ? <p className="muted" style={{ padding: 12 }}>{f.large ? `This file is ${kb(f.size)} — too large to show here.` : 'This is a binary file — there is no text to show.'}</p>
        : <MonacoEditor height="100%" language={f.language} value={f.text} theme={dark ? 'vs-dark' : 'vs'} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'off', renderLineHighlight: 'line', automaticLayout: true, folding: true, contextmenu: false }} />}
    </div>
  );
}
