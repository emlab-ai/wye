// One proposed card for op:api.propose (req:exec.wye-proposes): checked and normalised before it is written, and placed
// where it belongs. Wye cards are not strict yaml (a title may hold a colon), so the check is of shape: one card, keys
// at one indentation, no key twice — the shapes an agent's edit-by-repropose produced (a second card nested in the
// first, an old and a new title side by side) are refused with the reason, not written.
export function parseCard(raw: string): { id: string; block: string } | { error: string } {
  const card = raw.replace(/^```ya?ml\s*\n|\n```\s*$/g, '').replace(/\s+$/, '').replace(/^\s*\n/, '');
  const lines = card.split('\n');
  const idm = lines[0].match(/^\s*-?\s*id:\s*([a-z-]+:[A-Za-z0-9_.\-]+)\s*$/);
  if (!idm) return { error: 'the card must start with `- id: kind:slug`' };
  const rest = lines.slice(1).filter(l => l.trim());
  const ind = (l: string) => l.match(/^\s*/)![0].length;
  const key = rest.length ? ind(rest[0]) : 0;
  const seen = new Set<string>();
  for (const l of rest) {
    const n = ind(l); const t = l.trim();
    if (n < key || (n === key && key === 0 && t.startsWith('- '))) return t.startsWith('- ') && /^-\s*id:/.test(t) ? { error: 'one card per propose — this text holds a second card; propose it on its own' } : { error: `the indentation drops below the card's keys at "${t.slice(0, 40)}" — keep every key at one indentation` };
    if (/^-?\s*id:\s/.test(t)) return { error: 'one card per propose — this text holds a second card; propose it on its own (to change a card, use wye node set / wye node content)' };
    if (n !== key) continue;
    if (t.startsWith('- ')) return { error: 'one card per propose — a list item sits at the level of the card\'s keys' };
    const k = t.match(/^([A-Za-z][\w-]*):/)?.[1];
    if (!k) return { error: `"${t.slice(0, 40)}" is not a key: value line` };
    if (seen.has(k)) return { error: `the key "${k}" is given twice — a card holds each key once (to change a card, use wye node set / wye node content)` };
    seen.add(k);
  }
  if (!seen.has('status')) return { error: 'the card needs a status (proposed, or open for a question)' };
  // the card as a list item: keys two deep, deeper lines keep their depth relative to the keys
  const block = [`- id: ${idm[1]}`, ...rest.map(l => `  ${l.slice(key)}`)].join('\n');
  return { id: idm[1], block };
}

// Where a card goes in a document: on a request page (it has a Definition) at the end of the Definition — never at the
// end of the file, which is the Result the app rewrites when the build ends; anywhere else at the end.
export function placeCard(md: string, fence: string): string {
  const m = md.match(/^## Definition[^\n]*\n/m);
  if (!m || m.index === undefined) return `${md.replace(/\s+$/, '')}\n\n${fence}\n`;
  const start = m.index + m[0].length; const after = md.slice(start); const n = after.search(/^## /m);
  const end = n === -1 ? md.length : start + n;
  return `${md.slice(0, start)}${md.slice(start, end).replace(/\s+$/, '')}\n\n${fence}\n${n === -1 ? '' : '\n'}${md.slice(end)}`;
}
