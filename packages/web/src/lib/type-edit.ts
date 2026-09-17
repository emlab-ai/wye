// Edit a type: card in its document text: its own props block (name, value type, required, inverse) and scalar keys.
export type OwnProp = { name: string; type: string; required: boolean; inverse: string };

// `<type>[?] [-(inverse)-> name]` — the grammar lib/parse.js parsePropSpec reads
export function propSpec(p: OwnProp): string {
  return `${p.type.trim()}${p.required ? '' : '?'}${p.inverse.trim() ? ` -(inverse)-> ${p.inverse.trim()}` : ''}`;
}

export function setTypeProps(md: string, typeId: string, props: OwnProp[] | null, scalars: Record<string, string | null> = {}): { md: string; error?: 'not_found' } {
  const lines = md.split('\n');
  const idRe = new RegExp('^(\\s*-?\\s*)id:\\s*' + typeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  const start = lines.findIndex(l => idRe.test(l)); if (start < 0) return { md, error: 'not_found' };
  const indent = lines[start].match(idRe)![1].replace('-', ' ');
  // the card ends at the next card, the fence, or a line indented less than its keys
  let end = start + 1;
  while (end < lines.length && lines[end].trim() && !/^\s*-\s*id:/.test(lines[end]) && !/^\s*```/.test(lines[end]) && lines[end].startsWith(indent)) end++;
  const keyAt = (key: string) => lines.findIndex((l, k) => k > start && k < end && new RegExp('^' + indent + key + ':').test(l));
  const blockEnd = (i: number) => { let j = i + 1; while (j < end && lines[j].startsWith(indent + ' ')) j++; return j; };
  for (const [key, value] of Object.entries(scalars)) {
    const i = keyAt(key);
    if (value === null || value === '') { if (i >= 0) { const j = blockEnd(i); lines.splice(i, j - i); end -= j - i; } continue; }
    if (i >= 0) { const j = blockEnd(i); lines.splice(i, j - i, `${indent}${key}: ${value}`); end -= j - i - 1; }
    else { const p = keyAt('props'); const at = p >= 0 ? p : end; lines.splice(at, 0, `${indent}${key}: ${value}`); end++; }
  }
  if (props) {
    const block = props.filter(p => p.name.trim()).map(p => `${indent}  ${p.name.trim()}: ${propSpec(p)}`);
    const i = keyAt('props');
    if (i >= 0) { const j = blockEnd(i); lines.splice(i, j - i, ...(block.length ? [`${indent}props:`, ...block] : [])); }
    else if (block.length) lines.splice(end, 0, `${indent}props:`, ...block);
  }
  return { md: lines.join('\n') };
}

// A new `type:` card: extends and purpose; properties come later through setTypeProps.
export function newTypeCard(id: string, extendsId: string, purpose: string): string {
  const lines = [`- id: ${id}`, `  extends: ${extendsId}`];
  const p = purpose.trim();
  if (p) lines.push(/[:#]|^[-'"[{&*!|>%@`]/.test(p) ? `  purpose: >\n    ${p}` : `  purpose: ${p}`);
  return lines.join('\n');
}
// Appended to the yaml fence that declares the document's last type card — types stay together — else to the last
// fence of list cards, else as a new fence at the end. A fence holding one bare `id:` card (a document's own card)
// cannot take a `- id:` item.
export function appendTypeCard(md: string, card: string): string {
  const all = [...md.matchAll(/^```ya?ml\n[\s\S]*?^```/gm)];
  const lists = all.filter(f => /^\s*-\s*id:/m.test(f[0]));
  const last = lists.filter(f => /^\s*-\s*id:\s*type:/m.test(f[0])).pop() ?? lists.pop();
  if (last && last.index !== undefined) {
    const end = last.index + last[0].length - 3;
    return md.slice(0, end) + card + '\n' + md.slice(end);
  }
  return md.replace(/\s*$/, '') + '\n\n```yaml\n' + card + '\n```\n';
}
