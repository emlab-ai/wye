// New instance cards for a type: the card body, and where it goes in the home document.
import type { TypeDef } from './graph';

export function newInstanceCard(t: TypeDef, id: string, title: string, extra: Record<string, string> = {}): string {
  const skip = new Set(['title', 'status', 'text', ...Object.keys(extra)]);
  const lines = [`- id: ${id}`];
  if (title) lines.push(`  title: ${title}`);
  for (const [k, v] of Object.entries(extra)) lines.push(`  ${k}: ${v}`);
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

// --- the type's collection document (decision:ontology.collection-document, req:ontology.instance-home) ---

// The document's title: the type card's `plural:`, else the English plural of the type's name — city → Cities,
// bug → Bugs, box → Boxes, test-case → Test cases.
export function pluralTitle(t: Pick<TypeDef, 'slug' | 'plural'>): string {
  if (t.plural?.trim()) return t.plural.trim();
  const words = t.slug.split(/[-_]+/).filter(Boolean);
  const last = words[words.length - 1] ?? t.slug;
  const plural = /[^aeiou]y$/.test(last) ? last.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(last) ? last + 'es' : last + 's';
  const title = [...words.slice(0, -1), plural].join(' ');
  return title.charAt(0).toUpperCase() + title.slice(1);
}
// The blank template's placeholder paragraph becomes the type's table block, and the document card says what it holds.
export function collectionDoc(blank: string, slug: string): string {
  return blank
    .replace(/^Write here\..*$/m, `<!-- table:${slug} -->\n<!-- /table:${slug} -->`)
    .replace(/^purpose: >\n  What this document covers, for whom\.$/m, `purpose: every ${slug} of the product, one row each — the home of type:${slug}`);
}
// A row goes before the type's closing table marker; a document without the type's table gets one at the end.
export function appendRow(md: string, slug: string, row: string): string {
  const close = new RegExp(`^<!--\\s*/table:${slug}\\s*-->\\s*$`, 'm');
  const m = md.match(close);
  if (m && m.index !== undefined) return md.slice(0, m.index) + row + '\n' + md.slice(m.index);
  return md.replace(/\s*$/, '') + `\n\n<!-- table:${slug} -->\n${row}\n<!-- /table:${slug} -->\n`;
}
export const hasTable = (md: string, slug: string) => new RegExp(`^<!--\\s*/table:${slug}\\s*-->\\s*$`, 'm').test(md);
// A table row is a prose node line: the id, then the title as its text (rule:type-tables).
export function newInstanceRow(id: string, title: string, extra: Record<string, string> = {}): string {
  const props = Object.entries(extra).map(([k, v]) => `${k}: ${v}`).join(', ');
  return `- ${id} ${title.trim() || id.split(':').slice(1).join(':')}${props ? ` (${props})` : ''}`;
}
