'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const STATUSES = ['proposed', 'partial', 'shipped', 'deprecated'];

// The document header: title and properties, always editable; a field saves when it loses focus.
export function DocProps({ project, slug, file, fm }: { project: string; slug: string; file: string; fm: Record<string, string> }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(fm);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => { setVals(fm); }, [fm]);
  async function commit(key: string) {
    if ((vals[key] ?? '') === (fm[key] ?? '')) return;
    setState('saving');
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { [key]: vals[key] ?? '' } }) });
    setState(r.ok ? 'saved' : 'error'); router.refresh();
  }
  const field = (key: string, cls = '') => <input className={`prop-in ${cls}`} value={vals[key] ?? ''} placeholder={key} onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))} onBlur={() => commit(key)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
  return (
    <header className="doc-head">
      <div className="pills">
        <span className="pill k" style={{ background: 'var(--k-module)' }}>document</span>
        <select className="status-sel" value={vals.status ?? ''} onChange={e => { setVals(v => ({ ...v, status: e.target.value })); }} onBlur={() => commit('status')}>{[vals.status ?? '', ...STATUSES].filter((v, i, a) => a.indexOf(v) === i).map(v => <option key={v} value={v}>{v || '—'}</option>)}</select>
        <span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'error' ? 'save failed' : ''}</span>
      </div>
      {field('title', 'h1')}
      <p className="sub">{file} · owner {field('owner')} · verified {field('last-verified')}</p>
    </header>
  );
}
