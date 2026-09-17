// New instance cards for a type: the card body, and where it goes in the home document.
import type { TypeDef } from './graph';

export function newInstanceCard(t: TypeDef, id: string, title: string): string {
  const skip = new Set(['title', 'status', 'text']);
  const lines = [`- id: ${id}`];
  if (title) lines.push(`  title: ${title}`);
  for (const p of t.props) if (p.required && !skip.has(p.name)) lines.push(`  ${p.name}: ${p.many ? '[]' : ''}`.trimEnd());
  return lines.join('\n');
}
// Appended to the document's last yaml fence when there is one, else as a new fence at the end.
export function appendCard(md: string, card: string): string {
  const fences = [...md.matchAll(/^```ya?ml\n[\s\S]*?^```/gm)];
  const last = fences[fences.length - 1];
  if (last && last.index !== undefined) {
    const end = last.index + last[0].length - 3;
    return md.slice(0, end) + card + '\n' + md.slice(end);
  }
  return md.replace(/\s*$/, '') + '\n\n```yaml\n' + card + '\n```\n';
}
