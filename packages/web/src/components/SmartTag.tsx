'use client';
import { usePeek } from './PeekProvider';
import { kindOf } from '@/lib/ids';
import { useRouter } from 'next/navigation';

export function SmartTag({ id, label }: { id: string; label?: string }) {
  const { index, open, hrefFor } = usePeek();
  const router = useRouter();
  const e = index[id]; const kind = kindOf(id);
  const text = label ?? (kind === 'req' ? id.slice(4) : id);
  const tip = (e ? `${e.title}${e.status ? ' · ' + e.status : ''}${e.defined ? '' : ' · referenced only'}` : id) + (e?.doc ? ' · ⌘-click to open the document' : '');
  return (
    <a href={`#tag:${id}`} className={`tag k-${kind} ${e && !e.defined ? 'stub' : ''} ${e?.status ? 's-' + e.status : ''}`} title={tip}
       onClick={ev => { ev.preventDefault(); if ((ev.metaKey || ev.ctrlKey) && e?.doc) { const doc = hrefFor(id); if (doc) { router.push(doc.replace(/#.*$/, '')); return; } } open(id); }}>
      <i />{text}
    </a>
  );
}
