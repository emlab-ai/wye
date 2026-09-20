// Link every plain occurrence of a phrase to a node (req:wf2.editor.entity-from-text): "London" as a word becomes
// `[London](city:london)` everywhere it is still a word — never inside frontmatter, code, html comments, an existing
// link or tag, an id, a url, or the key side of a yaml card; inside a yaml card only in the text-bearing values.
// Pure: `linkAll(md, phrase, id)` returns the new markdown and the count; the route applies it per document.

const TEXT_KEYS = /^(\s*)(text|title|statement|q|choice|description|purpose|context|when|then|unless|note|does|alternatives|consequences|reason|q|what):\s*(.*)$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// occurrences on one line of prose: whole words, not already linked, not part of an id / url / code span
function linkLine(line: string, phrase: string, id: string): [string, number] {
  // a whole word: not glued to letters, digits, brackets, id / url punctuation, or a dotted name (`london.md`)
  const re = new RegExp(`(?<![\\w\\[\\]():/@#\`-])(?<!\\w\\.)(${escape(phrase)})(?![\\w\\]():/@-])(?!\\.\\w)`, 'g');
  let count = 0; let out = ''; let last = 0; let m: RegExpExecArray | null;
  // code spans and existing links are opaque: mask them, then only replace outside the masks
  const masks: [number, number][] = [];
  for (const mm of line.matchAll(/`[^`]*`|!?\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g)) masks.push([mm.index!, mm.index! + mm[0].length]);
  const masked = (i: number) => masks.some(([a, b]) => i >= a && i < b);
  while ((m = re.exec(line))) {
    const at = m.index;
    if (masked(at)) continue;
    out += line.slice(last, at) + `[${m[1]}](${id})`; last = at + m[1].length; count++;
    re.lastIndex = last;
  }
  return [out + line.slice(last), count];
}

export function linkAll(md: string, phrase: string, id: string): { md: string; count: number } {
  const p = phrase.trim(); if (!p || !id) return { md, count: 0 };
  const lines = md.split('\n'); let count = 0;
  let fence: string | null = null, fm = false, comment = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i === 0 && l === '---') { fm = true; continue; }
    if (fm) { if (l === '---') fm = false; continue; }
    const f = l.match(/^\s*(```+|~~~+)\s*(\w*)/);
    if (f) { if (fence === null) fence = f[2] || 'code'; else fence = null; continue; }
    if (comment) { if (l.includes('-->')) comment = false; continue; }
    if (/^\s*<!--/.test(l)) { if (!l.includes('-->')) comment = true; continue; }
    if (fence !== null) {
      if (fence !== 'yaml') continue;
      // a yaml card: only the text-bearing values, or a folded value's continuation lines (indented, no key)
      const k = l.match(TEXT_KEYS);
      if (k) { const [v, n] = linkLine(k[3], p, id); if (n) { lines[i] = `${k[1]}${k[2]}: ${v}`; count += n; } continue; }
      if (/^\s{4,}\S/.test(l) && !/^\s*[a-z][\w-]*:/.test(l) && !/^\s*-\s/.test(l)) { const [v, n] = linkLine(l, p, id); if (n) { lines[i] = v; count += n; } }
      continue;
    }
    // a prose line: never the id at its start, never a `key: value` property group's keys
    if (/^\s*[|]/.test(l) && /^\s*\|[\s-:|]+\|\s*$/.test(l)) continue; // a table's rule row
    const [v, n] = linkLine(l, p, id);
    if (n) { lines[i] = v; count += n; }
  }
  return { md: lines.join('\n'), count };
}

// how many plain occurrences a document holds, without changing it
export function countPlain(md: string, phrase: string): number { return linkAll(md, phrase, 'x:y').count; }
