'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { bodyToFields, fieldsToBody, type FormField } from '@/lib/yaml-form';
import { usePeek } from './PeekProvider';

const STATUSES = ['proposed', 'approved', 'unverified', 'api-only', 'shipped', 'deprecated', 'question'];

// Wraps a server-rendered card. Edit turns it into a form; Save writes the chunk back with its hash.
export function CardEditor({ project, slug, segment, chunk, id, body, ifMatch, children }: { project: string; slug: string; segment: number; chunk: number; id: string; body: string; ifMatch: string; children: ReactNode }) {
  const router = useRouter();
  const { index } = usePeek();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ids = useMemo(() => Object.keys(index).sort(), [index]);

  function start() { setFields(bodyToFields(body).fields); setEditing(true); setMsg(null); }
  function set(i: number, value: string) { setFields(f => f.map((x, j) => j === i ? { ...x, value } : x)); }
  function addField() { const key = prompt('Key name (e.g. note, verified-by, source)'); if (!key) return; setFields(f => [...f, { key: key.trim(), value: '', kind: /-by$|^refines$|^see$|^resolves$/.test(key) ? 'list' : 'text' }]); }

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-chunk', segment, chunk, ifMatch, body: fieldsToBody(id, fields) }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error === 'conflict' ? 'This card changed on disk. Reload the page and edit again.' : `Save failed: ${j.error}`); return; }
    setMsg(j.lintOk ? null : `Saved. Lint: ${(j.lintErrors as string[]).join(' · ') || 'see ctx check'}`);
    setEditing(false); router.refresh();
  }

  if (!editing) return <div className="sec"><div className="sec-tools"><button onClick={start}>Edit</button></div>{children}{msg && <p className="notice">{msg}</p>}</div>;
  return (
    <div className="card editing">
      <header><code className="cid">{id}</code></header>
      <datalist id="wf-ids">{ids.map(i => <option key={i} value={i} />)}</datalist>
      <div className="form">
        {fields.map((f, i) => (
          <label key={f.key + i}>
            <span>{f.key}</span>
            {f.key === 'status' ? (
              <select value={f.value} onChange={e => set(i, e.target.value)}>{[f.value, ...STATUSES].filter((v, k, a) => a.indexOf(v) === k).map(v => <option key={v} value={v}>{v || '—'}</option>)}</select>
            ) : f.kind === 'prose' || f.kind === 'nested' ? (
              <textarea value={f.value} rows={Math.min(12, Math.max(2, f.value.split('\n').length + 1))} onChange={e => set(i, e.target.value)} />
            ) : f.kind === 'list' ? (
              <input value={f.value} list="wf-ids" placeholder="comma-separated ids" onChange={e => set(i, e.target.value)} />
            ) : (
              <input value={f.value} onChange={e => set(i, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      <div className="sec-actions">
        <button className="pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button disabled={busy} onClick={addField}>+ key</button>
        {msg && <span className="notice">{msg}</span>}
      </div>
    </div>
  );
}
