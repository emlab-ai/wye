import { ID_RE, cleanId } from '@/lib/ids';
import { SmartTag } from './SmartTag';
import type { ReactNode } from 'react';

// Renders text with every kind:slug token as a SmartTag; trailing punctuation stays text.
export function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null;
  const re = new RegExp(ID_RE.source, 'g');
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const trail = m[0].match(/[.,;:)\]]+$/)?.[0] ?? '';
    const shown = m[0].slice(0, m[0].length - trail.length);
    parts.push(<SmartTag key={m.index} id={cleanId(shown)} label={shown} />);
    if (trail) parts.push(trail);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
