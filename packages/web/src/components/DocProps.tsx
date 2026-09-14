'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusPill } from './Pills';

const KEYS = ['title', 'status', 'owner', 'last-verified'] as const;

// The document header: title and properties, editable in place through the frontmatter op.
export function DocProps({ project, slug, file, fm }: { project: string; slug: string; file: string; fm: Record<string, string> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  function start() { setVals(Object.fromEntries(KEYS.map(k => [k, fm[k] ?? '']))); setEditing(true); }
  async function save() {
    setBusy(true);
    const patch: Record<string, string> = {}; for (const k of KEYS) if ((vals[k] ?? '') !== (fm[k] ?? '')) patch[k] = vals[k];
    if (Object.keys(patch).length) await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch }) });
    setBusy(false); setEditing(false); router.refresh();
  }
  if (!editing) {
    return (
      <header className="doc-head sec">
        <div className="sec-tools"><button onClick={start}>Edit properties</button></div>
        <div className="pills"><span className="pill k" style={{ background: 'var(--k-module)' }}>document</span><StatusPill status={fm.status ?? ''} /></div>
        <h1>{fm.title ?? slug}</h1>
        <p className="sub">{file}{fm['last-verified'] && <> · verified {fm['last-verified']}</>}{fm.owner && <> · {fm.owner}</>}</p>
      </header>
    );
  }
  return (
    <header className="doc-head card editing">
      <div className="form">
        {KEYS.map(k => <label key={k}><span>{k}</span><input value={vals[k] ?? ''} onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))} /></label>)}
      </div>
      <div className="sec-actions"><button className="pri" disabled={busy} onClick={save}>Save</button><button disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </header>
  );
}
