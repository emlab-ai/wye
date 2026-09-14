'use client';
import { usePeek } from './PeekProvider';
import { kindOf } from '@/lib/ids';
import { docSlug } from '@/lib/doc';
import { useRouter } from 'next/navigation';

export function SmartTag({ id, label }: { id: string; label?: string }) {
  const { index, open, project } = usePeek();
  const router = useRouter();
  const e = index[id]; const kind = kindOf(id);
  const text = label ?? (kind === 'req' ? id.slice(4) : id);
  const tip = e ? `${e.title}${e.status ? ' · ' + e.status : ''}${e.defined ? '' : ' · referenced only'}` : id;
  return (
    <a href={`#tag:${id}`} className={`tag k-${kind} ${e && !e.defined ? 'stub' : ''} ${e?.status ? 's-' + e.status : ''}`} title={tip}
       onClick={ev => { ev.preventDefault(); if (kind === 'module' && e?.file) router.push(`/p/${project}/d/${docSlug(e.file)}`); else open(id); }}>
      <i />{text}
    </a>
  );
}
