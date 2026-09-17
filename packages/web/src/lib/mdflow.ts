import { ID_RE, cleanId } from './ids';

// Join hard-wrapped paragraph lines so the block editor does not turn them into line breaks.
// Lists, tables, headings, quotes, fenced code and indented code are left alone.
export function unwrapParagraphs(md: string): string {
  const out: string[] = [];
  let fence = false; let inItem = false; // inItem: the previous output line is a list item (or its joined continuation)
  const isListItem = (l: string) => /^\s*([-*+]|\d+[.)])\s/.test(l);
  const isBlockStart = (l: string) => /^(\s*([-*+]|\d+[.)])\s|\s*[|#>]|\s{4,}|```|~~~|\s*$|\s*<!--)/.test(l) || /^---\s*$/.test(l);
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; out.push(line); inItem = false; continue; }
    if (fence) { out.push(line); continue; }
    const prev = out[out.length - 1];
    const hardBreak = prev !== undefined && /( {2}|\\)$/.test(prev);
    // a wrapped list item: an indented, non-blank line that is not itself a list item, heading, table or fence
    const lazy = inItem && /^\s+\S/.test(line) && !isListItem(line) && !/^\s*[|#>]/.test(line) && !/^\s*<!--/.test(line) && !hardBreak;
    const canJoin = prev !== undefined && prev.trim() !== '' && !isBlockStart(prev) && !isBlockStart(line) && !hardBreak;
    if (lazy || canJoin) { out[out.length - 1] = prev.replace(/\s+$/, '') + ' ' + line.trim(); continue; }
    out.push(line);
    inItem = isListItem(line);
  }
  return out.join('\n');
}

// Minimal structural view of BlockNote inline content, enough to insert tags without importing its types.
export type InlineText = { type: 'text'; text: string; styles: Record<string, unknown> };
export type InlineTag = { type: 'tag'; props: { id: string } };
export type InlineOther = { type: string; content?: Inline[]; [k: string]: unknown };
export type Inline = InlineText | InlineTag | InlineOther;

// Split every plain text run on kind:slug tokens into text + tag inline content. A code-styled run that is
// exactly one id becomes a tag; other code runs are left alone.
export function tagifyInline(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (it.type === 'text') {
      const t = it as InlineText;
      const code = Boolean(t.styles && (t.styles as { code?: boolean }).code);
      const re = new RegExp(ID_RE.source, 'g');
      if (code) { const m = t.text.trim().match(new RegExp('^' + ID_RE.source + '$')); if (m) out.push({ type: 'tag', props: { id: cleanId(t.text.trim()) } }); else out.push(it); continue; }
      let last = 0; let m: RegExpExecArray | null; let any = false;
      while ((m = re.exec(t.text))) {
        any = true;
        const trail = m[0].match(/[.,;:)\]]+$/)?.[0] ?? '';
        const shown = m[0].slice(0, m[0].length - trail.length);
        if (m.index > last) out.push({ type: 'text', text: t.text.slice(last, m.index), styles: t.styles });
        out.push({ type: 'tag', props: { id: cleanId(shown) } });
        if (trail) out.push({ type: 'text', text: trail, styles: t.styles });
        last = m.index + m[0].length;
      }
      if (!any) { out.push(it); continue; }
      if (last < t.text.length) out.push({ type: 'text', text: t.text.slice(last), styles: t.styles });
      continue;
    }
    if (it.type !== 'tag' && Array.isArray((it as InlineOther).content)) { out.push({ ...(it as InlineOther), content: tagifyInline((it as InlineOther).content as Inline[]) }); continue; }
    out.push(it);
  }
  return out;
}

// Apply tagifyInline to every block (and nested children / table cells) in place-safe fashion.
export function tagifyBlocks<T extends { type?: string; content?: unknown; children?: T[] }>(blocks: T[]): T[] {
  return blocks.map(b => {
    const nb = { ...b } as T & { type?: string; content?: unknown; children?: T[] };
    if (nb.type === 'codeBlock') return nb; // code keeps its text verbatim
    if (Array.isArray(nb.content)) nb.content = tagifyInline(nb.content as Inline[]);
    else if (nb.content && typeof nb.content === 'object' && Array.isArray((nb.content as { rows?: unknown[] }).rows)) {
      const table = nb.content as { rows: { cells: unknown[] }[] };
      nb.content = { ...table, rows: table.rows.map(r => ({ ...r, cells: r.cells.map(c => Array.isArray(c) ? tagifyInline(c as Inline[]) : (c && typeof c === 'object' && Array.isArray((c as { content?: unknown }).content)) ? { ...(c as object), content: tagifyInline((c as { content: Inline[] }).content) } : c) })) };
    }
    if (Array.isArray(nb.children) && nb.children.length) nb.children = tagifyBlocks(nb.children);
    return nb as T;
  });
}
