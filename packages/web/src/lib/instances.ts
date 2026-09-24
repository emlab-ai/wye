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

// Where a card sits in a document: its `- id:` line and every line indented under it, blanks inside the card included.
// null when the id has no card there. The three card edits below are this one scan.
function cardAt(md: string, id: string): { lines: string[]; start: number; end: number } | null {
  const lines = md.split('\n');
  const start = lines.findIndex(l => new RegExp(`^-\\s+id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (/^\s+\S/.test(lines[end]) || (!lines[end].trim() && /^\s+\S/.test(lines[end + 1] ?? '')))) end++;
  return { lines, start, end };
}
// The card as it is written, `- id:` line and all. null when it is not there.
export function cardText(md: string, id: string): string | null {
  const at = cardAt(md, id); if (!at) return null;
  return at.lines.slice(at.start, at.end).join('\n');
}
// The card of an id replaced in place. null when it is not there.
export function replaceCard(md: string, id: string, card: string): string | null {
  const at = cardAt(md, id); if (!at) return null;
  return [...at.lines.slice(0, at.start), ...card.replace(/\n$/, '').split('\n'), ...at.lines.slice(at.end)].join('\n');
}
// The card of an id taken out of the document, with the blank line it leaves. null when it is not there.
export function removeCard(md: string, id: string): string | null {
  const at = cardAt(md, id); if (!at) return null;
  return [...at.lines.slice(0, at.start), ...at.lines.slice(at.end)].join('\n');
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
// A type's collection document, from the blank page: the hint line becomes the table markers, and the page gets the
// one card a blank page does not — it is the home of the type (decision:ontology.collection-document), which is what
// its purpose says.
export function collectionDoc(blank: string, slug: string): string {
  const node = blank.match(/^node:\s*(\S+)$/m)?.[1] ?? `module:${slug}`;
  const card = ['```yaml', `id: ${node}`, `purpose: every ${slug} of the product, one row each — the home of type:${slug}`, '```'].join('\n');
  return blank.replace(/^Write here\..*$/m, `${card}\n\n<!-- table:${slug} -->\n<!-- /table:${slug} -->`);
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
