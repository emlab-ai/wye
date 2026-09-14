import { visit } from 'unist-util-visit';
import type { Root, Text, InlineCode, Link, PhrasingContent } from 'mdast';
import { ID_RE, cleanId } from './ids';

// Turns every kind:slug token in text and inline code into a link with href "#tag:<id>"; Document.tsx renders
// those links as SmartTag components. Text already inside a link is left alone.
export default function remarkTags() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (parent.type === 'link') return;
      if (node.type !== 'text' && node.type !== 'inlineCode') return;
      const value = (node as Text | InlineCode).value;
      const re = new RegExp(ID_RE.source, 'g');
      const parts: PhrasingContent[] = []; let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(value))) {
        if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) });
        const trail = m[0].match(/[.,;:)\]]+$/)?.[0] ?? '';
        const shown = m[0].slice(0, m[0].length - trail.length);
        const link: Link = { type: 'link', url: '#tag:' + cleanId(shown), children: [{ type: 'text', value: shown }] };
        parts.push(link);
        if (trail) parts.push({ type: 'text', value: trail });
        last = m.index + m[0].length;
      }
      if (!parts.length) return;
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
