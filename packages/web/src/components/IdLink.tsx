import { ID_RE, cleanId } from '@/lib/ids';
import { SmartTag } from './SmartTag';
import type { ReactNode } from 'react';

// Renders text with every kind:slug token as a SmartTag; trailing punctuation stays text. A markdown image in the
// text (![alt](assets/x.png), a node's screenshot) renders as a thumbnail; `base` is the folder its relative url
// resolves against (assetBase of the node's document).
export function Linkified({ text, base = '' }: { text: string; base?: string }) {
  const parts: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null;
  const re = new RegExp(`!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)|${ID_RE.source}`, 'g');
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    if (m[0].startsWith('![')) {
      const src = /^[a-z]+:|^\//.test(m[2]) ? m[2] : base + m[2];
      parts.push(<a key={m.index} href={src} target="_blank" rel="noreferrer"><img className="inline-img" src={src} alt={m[1]} title={m[1] || m[2]} /></a>);
    } else {
      const trail = m[0].match(/[.,;:)\]]+$/)?.[0] ?? '';
      const shown = m[0].slice(0, m[0].length - trail.length);
      parts.push(<SmartTag key={m.index} id={cleanId(shown)} label={shown} />);
      if (trail) parts.push(trail);
    }
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
