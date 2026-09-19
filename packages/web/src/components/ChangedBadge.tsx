'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import type { ChangeRecord } from '@/lib/changes';

// The "changed" badge on a node (req:exec.change-kept): a pending change record exists for it; the old value is on
// hover, the Inbox lists the record under Changes.
export function ChangedBadge({ id }: { id: string }) {
  const { product } = usePeek();
  const [c, setC] = useState<ChangeRecord | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/${product}/changes?node=${encodeURIComponent(id)}&state=pending`).then(r => r.ok ? r.json() : { changes: [] }).then(j => { if (live) setC(j.changes[0] ?? null); }).catch(() => {});
    load();
    const onChange = (e: Event) => { const d = (e as CustomEvent<{ kinds: string[] }>).detail; if (d.kinds.includes('change') || d.kinds.includes('graph')) load(); };
    window.addEventListener('wf:change', onChange);
    return () => { live = false; window.removeEventListener('wf:change', onChange); };
  }, [product, id]);
  if (!c) return null;
  const old = [c.changed.includes('text') ? c.before.text : '', ...c.changed.filter(k => k !== 'text').map(k => `${k}: ${k === 'status' ? c.before.status : c.before.props[k] ?? '—'}`)].filter(Boolean).join(' · ');
  return <a className="node-changed" href={`/${product}/inbox`} title={`edited by ${c.by} — old value: ${old.slice(0, 400)}`}>changed</a>;
}
