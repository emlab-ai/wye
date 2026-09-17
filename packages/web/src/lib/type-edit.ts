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
