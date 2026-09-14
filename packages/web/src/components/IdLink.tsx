import Link from 'next/link';
import { ID_RE, cleanId, kindOf } from '@/lib/ids';
import type { ReactNode } from 'react';

export function IdLink({ id, project, label }: { id: string; project: string; label?: string }) {
  return <Link href={`/p/${project}/n/${encodeURIComponent(id)}`} className={`nid k-${kindOf(id)}`}>{label ?? id}</Link>;
}

export function Linkified({ text, project }: { text: string; project: string }) {
  const parts: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null;
  const re = new RegExp(ID_RE.source, 'g');
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    parts.push(<IdLink key={m.index} id={cleanId(m[0])} project={project} label={m[0]} />);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
