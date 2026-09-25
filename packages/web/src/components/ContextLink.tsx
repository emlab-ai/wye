'use client';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { TagHover, useNodeHover } from './SmartTag';
import { kindOf } from '@/lib/ids';

// A context link (decision:wf2.a-link-is-on-the-words): a link to a node inside prose is the words it belongs to,
// underlined with a dotted line in the colour of its kind — not a pill carrying an id. An id dropped in the middle of
// a sentence has nothing to hold onto and says nothing to a reader; where one is still written, the node's title
// stands in for it, so the sentence reads. Hovering opens the node's card, a click selects it in the Context panel
// (rule:block-select) so you keep your place, ⌘-click opens its document.
// What an id alone reads as: its title when that is a name — short, no sentence in it — else its slug. A type's title
// is its whole purpose, and a sentence pasted mid-paragraph is exactly the noise this is here to remove.
export function shortName(id: string, title?: string): string {
  const t = (title ?? '').trim();
  const slug = id.slice(id.indexOf(':') + 1);
  if (!t || t === id || t.length > 40 || /[.;:—]\s/.test(t)) return slug;
  return t;
}

export function ContextLink({ id, label }: { id: string; label?: string }) {
  const { index, select, setShowContext, hrefFor } = usePeek();
  const router = useRouter();
  const h = useNodeHover();
  const e = index[id];
  const words = (label ?? '').trim();
  const text = words && words !== id ? words : shortName(id, e?.title);
  return (
    <>
      <a ref={h.ref} href={`#tag:${id}`} className={`nlink k-${kindOf(id)} ${e && !e.defined ? 'stub' : ''}`} title={id}
         onMouseEnter={h.show} onMouseLeave={h.hide} onMouseDown={h.drop}
         onClick={ev => {
           ev.preventDefault();
           if ((ev.metaKey || ev.ctrlKey) && e?.doc) { const doc = hrefFor(id); if (doc) { router.push(doc.replace(/#.*$/, '')); return; } }
           setShowContext(true); select(id);
         }}>{text}</a>
      {h.hover && <TagHover id={id} anchor={h.hover} onEnter={h.enterCard} onLeave={h.leaveCard} />}
    </>
  );
}
