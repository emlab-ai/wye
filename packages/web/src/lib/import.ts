// Markdown → editor blocks, in two steps: `prepare` (pure) lifts yaml blocks and rules out of the markdown and
// leaves markers; after BlockNote parses the rest in the browser, `expand` (pure) turns markers into divider and
// node blocks, turns id-first paragraphs into prose node blocks, and tags ids.
import { ID_RE, cleanId } from './ids';
import { splitDocument } from './doc';
import { tagifyBlocks, unwrapParagraphs, type Inline, type InlineText, type InlineOther } from './mdflow';
import { collectionKind, collectionView, type AnyBlock, type NodeProps } from './serialize';
import { EXTRA_GROUP } from './props';

const TEXT_KEYS = ['title', 'statement', 'description', 'purpose', 'q', 'text', 'context', 'does', 'intent'];
const TRAILING_STATUS = /(?:^|\s)#(proposed|approved|shipped|unverified|api-only|deprecated|question|drift|done|in-progress|blocked|open|todo|review|non-goal|partial|active|draft|complete|on-track|at-risk|off-track|paused|resolved|rejected|superseded|retired|dismissed|defining|defined|building|cancelled|failed)\s*$/;
const STATUS_TAG = /(?:^|\s)#(proposed|approved|shipped|unverified|api-only|deprecated|question|drift|done|in-progress|blocked|open|todo|review|non-goal|partial|active|draft|complete|on-track|at-risk|off-track|paused|resolved|rejected|superseded|retired|dismissed|defining|defined|building|cancelled|failed)\b/;

export interface Prepared { md: string; yaml: { id: string; body: string }[][]; drawings: { title: string; src: string }[]; images: { alt: string; url: string }[]; views: { slug: string; query: string }[]; embeds: string[]; tables: { query: string; view: 'table' | 'list' }[]; contents: string[] }
// How `expand` parses a block's lifted content: the whole pipeline again (prepare → BlockNote → expand), see importMarkdown
export type ParseMd = (md: string) => AnyBlock[];

// A drawing is referenced like an image whose file is an Excalidraw scene: ![Title](drawings/name.excalidraw)
// A table region: ordinary node lines between <!-- goals --> and <!-- /goals --> (or tasks), or for any type
// <!-- table:<slug> --> … <!-- /table:<slug> -->. The marker carries the kind of its rows and, after it, the table's
// filters as key=value pairs in the view block's grammar (rule:table-filter): <!-- table:bug status=open q="login" -->
export const COLLECTION_OPEN = /^<!--\s*(goals|tasks|(?:table|list):[a-z][a-z0-9-]*)((?:\s+[^\s>][^>]*?)?)\s*-->\s*$/;
export const COLLECTION_CLOSE = /^<!--\s*\/(goals|tasks|(?:table|list):[a-z][a-z0-9-]*)\s*-->\s*$/;

export const DRAWING_LINE = /^!\[([^\]]*)\]\((\S+\.excalidraw)\)\s*$/;
// A view: a live table of a type's instances with filters, one comment line, nothing stored (req:wf2.instances.view-block)
export const VIEW_LINE = /^<!--\s*view:([a-z][a-z0-9-]*)((?:\s+[^\s>][^>]*?)?)\s*-->\s*$/;
// An embed: a node from any document shown here as its card, one line `![[kind:slug]]` (rule:embed-line). The
// graph sees a paragraph that mentions the node; nothing of the node is stored in this document.
export const EMBED_LINE = /^!\[\[([a-z][a-z0-9-]*:[A-Za-z0-9_][A-Za-z0-9_./#\-]*)\]\]\s*$/;
// An image inside a paragraph's text — next to words, or on a line that continues a paragraph (a node's
// screenshot under its line) — is inline content of that paragraph; only an image that is a paragraph of its own
// is an image block. Lifted to %%IMG:n%% so the markdown parser cannot break the paragraph around it.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
export function liftInlineImages(text: string, images: { alt: string; url: string }[]): string {
  const lines = text.split('\n'); let fence = false;
  return lines.map((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return l; }
    if (fence || !l.includes('![')) return l;
    const alone = /^\s*!\[[^\]]*\]\([^)\s]+\)\s*$/.test(l);
    const prevBlank = i === 0 || !lines[i - 1].trim(), nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
    if (alone && prevBlank && nextBlank) return l;
    return l.replace(IMAGE_RE, (m, alt, url) => { if (url.endsWith('.excalidraw')) return m; images.push({ alt, url }); return `%%IMG:${images.length - 1}%%`; });
  }).join('\n');
}

// Replace yaml blocks with %%YAML:n%% paragraphs and --- rules with %%DIVIDER%% paragraphs; unwrap prose.
export function prepare(body: string): Prepared {
  const split = splitDocument(body); // the body has no frontmatter; only its segments matter
  const yaml: { id: string; body: string }[][] = [];
  const drawings: { title: string; src: string }[] = [];
  const images: { alt: string; url: string }[] = [];
  const views: { slug: string; query: string }[] = [];
  const embeds: string[] = [];
  const tables: { query: string; view: 'table' | 'list' }[] = []; // the filter query and view of every table / list marker that carries one, by index
  const contents: string[] = []; // the content of every block that has some (req:ontology.content), de-indented, by index
  const parts: string[] = [];
  const liftDrawings = (text: string) => { let fence = false; return text.split('\n').map(l => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return l; }
    if (fence) return l;
    const m = l.match(DRAWING_LINE); if (m) { drawings.push({ title: m[1], src: m[2] }); return `\n%%DRAWING:${drawings.length - 1}%%\n`; }
    const v = l.match(VIEW_LINE); if (v) { views.push({ slug: v[1], query: v[2].trim() }); return `\n%%VIEW:${views.length - 1}%%\n`; }
    const e = l.match(EMBED_LINE); if (e) { embeds.push(cleanId(e[1])); return `\n%%EMBED:${embeds.length - 1}%%\n`; }
    const o = l.match(COLLECTION_OPEN); if (o) { const q = o[2].trim(); const view = collectionView(o[1]); if (!q && view === 'table') return `\n%%COLLECTION:${collectionKind(o[1])}%%\n`; tables.push({ query: q, view }); return `\n%%COLLECTION:${collectionKind(o[1])}:${tables.length - 1}%%\n`; }
    const c = l.match(COLLECTION_CLOSE); if (c) return `\n%%/COLLECTION%%\n`;
    return l;
  }).join('\n'); };
  for (let i = 0; i < split.segments.length; i++) {
    const s = split.segments[i];
    if (s.type === 'yaml') {
      yaml.push(s.chunks.map(c => ({ id: c.id ?? '', body: c.body })));
      // the indented lines that open the next segment are the last card's content (decision:ontology.content-markdown)
      const next = split.segments[i + 1];
      let marker = `%%YAML:${yaml.length - 1}%%`;
      if (next && next.type === 'markdown' && /^ {2,}\S/.test(next.text)) {
        const { content, rest } = liftLeadingContent(next.text);
        if (content) { contents.push(content); marker += `%%CONTENT:${contents.length - 1}%%`; }
        next.text = rest;
      }
      parts.push(marker);
    }
    else if (s.type === 'hr') parts.push('%%DIVIDER%%');
    else if (s.text.trim()) parts.push(protectCode(escapeAngles(liftLinks(unwrapParagraphs(liftDrawings(liftInlineImages(liftContent(s.text, contents), images)))))));
  }
  return { md: parts.join('\n\n'), yaml, drawings, images, views, embeds, tables, contents };
}

// Content (req:ontology.content): the lines indented deeper than a block's line — a list item or a named paragraph
// — after its continuation text are its content. They are lifted out, de-indented, and a %%CONTENT:n%% marker ends
// the block's text; `expand` parses each one with the whole pipeline again, so nesting has no fixed depth and does
// not rely on the markdown parser's own (unreliable) nesting of mixed content under list items.
const ITEM_LINE = /^(\s*)(?:[-*+]|\d+[.)])\s/;
const NAMED_LINE = new RegExp('^(\\s*)' + ID_RE.source + '(?:\\s|$)');
const BLOCK_START = /^(\s*([-*+]|\d+[.)])\s|\s*[|#>]|\s*(```|~~~)|\s*$|\s*<!--)|^---\s*$/;
const indentOf = (l: string) => l.match(/^\s*/)![0].length;
export function liftContent(md: string, contents: string[]): string {
  const lines = md.split('\n'); const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^(```|~~~)/.test(l)) { out.push(l); i++; while (i < lines.length && !/^(```|~~~)/.test(lines[i])) out.push(lines[i++]); if (i < lines.length) out.push(lines[i++]); continue; }
    const item = ITEM_LINE.test(l), named = !item && NAMED_LINE.test(l) && !(out.length && out[out.length - 1].trim());
    if (!item && !named) { out.push(l); i++; continue; }
    const indent = indentOf(l);
    out.push(l); i++;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) out.push(lines[i++]); // continuation text, whatever its indent (rule:prose-round-trip)
    const run: string[] = []; let j = i;
    while (j < lines.length) {
      const c = lines[j];
      if (!c.trim()) { run.push(c); j++; continue; }
      if (indentOf(c) <= indent) break;
      if (/^\s*(```|~~~)/.test(c)) { const f = c.match(/^\s*(```|~~~)/)![1]; run.push(c); j++; while (j < lines.length && !lines[j].trimStart().startsWith(f)) run.push(lines[j++]); if (j < lines.length) run.push(lines[j++]); continue; } // a fence's body may dedent
      run.push(c); j++;
    }
    while (run.length && !run[run.length - 1].trim()) { run.pop(); j--; }
    while (run.length && !run[0].trim()) run.shift();
    if (run.some(x => x.trim())) {
      const base = Math.min(...run.filter(x => x.trim()).map(indentOf));
      contents.push(run.map(x => x.trim() ? x.slice(base) : '').join('\n'));
      out[out.length - 1] += ` %%CONTENT:${contents.length - 1}%%`;
      i = j;
      if (i < lines.length && lines[i].trim() && !ITEM_LINE.test(lines[i])) out.push(''); // what follows is a block of its own
    }
  }
  return out.join('\n');
}
// The indented lines a markdown segment starts with (a card's content after its fence) and the rest of the segment.
function liftLeadingContent(text: string): { content: string; rest: string } {
  const lines = text.split('\n'); let j = 0;
  while (j < lines.length && (!lines[j].trim() || indentOf(lines[j]) >= 2)) j++;
  const run = lines.slice(0, j); while (run.length && !run[run.length - 1].trim()) run.pop();
  if (!run.some(x => x.trim())) return { content: '', rest: text };
  const base = Math.min(...run.filter(x => x.trim()).map(indentOf));
  return { content: run.map(x => x.trim() ? x.slice(base) : '').join('\n'), rest: lines.slice(j).join('\n').replace(/^\n+/, '') };
}

// Split markdown into alternating [text, code, text, code, …] regions: fenced blocks, indented (4-space) blocks
// and inline spans count as code. Even indexes are text, odd indexes are code.
export function splitCode(md: string): string[] {
  const out: string[] = []; let text = ''; let code = '';
  const flushText = () => { out.push(text); text = ''; }; const flushCode = () => { out.push(code); code = ''; };
  const lines = md.split('\n'); let fence: string | null = null; let indented = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; const nl = i < lines.length - 1 ? '\n' : '';
    if (fence) { code += l + nl; if (l.trim().startsWith(fence)) { fence = null; flushCode(); } continue; }
    const fm = l.match(/^(```+|~~~+)/);
    if (fm) { if (indented) { indented = false; flushCode(); } flushText(); fence = fm[1]; code += l + nl; continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    if (/^ {4}|^\t/.test(l) && (indented || prevBlank)) { if (!indented) { flushText(); indented = true; } code += l + nl; continue; }
    if (indented && !l.trim()) { code += l + nl; continue; }
    if (indented) { indented = false; flushCode(); }
    // inline spans inside a text line
    const parts = l.split(/(`[^`]*`)/);
    for (let k = 0; k < parts.length; k++) { if (k % 2 === 1) { flushText(); out.push(parts[k]); } else text += parts[k]; }
    text += nl;
  }
  if (fence || indented) flushCode(); else flushText();
  return out;
}
const mapRegions = (md: string, onText: (s: string) => string, onCode: (s: string) => string) => splitCode(md).map((part, i) => i % 2 === 1 ? onCode(part) : onText(part)).join('');

// "<id or suffix>" would be parsed as an HTML tag and vanish, in prose and in code alike; escape it so it stays
// text. The importer turns &lt; back into < in every text run, code included.
export function escapeAngles(md: string): string {
  return md.replace(/<(?=[A-Za-z/])/g, '&lt;');
}

// Backslashes inside code would be unescaped by the browser parser; hold them in a placeholder.
export const PIPE = '⟪pipe⟫';
export const BS = '⟪bs⟫';
export function protectCode(md: string): string {
  // "\|" on a table row is a cell-escaped pipe even inside a code span (GFM); hold it whole so the row keeps its cells.
  const rows = md.split('\n').map(l => /^\s*\|/.test(l) ? l.replace(/\\\|/g, PIPE) : l).join('\n');
  return mapRegions(rows, t => t, c => c.replace(/\\/g, BS));
}

// [label](kind:slug) → ⟦label|kind:slug⟧ so the browser markdown parser never sees a scheme-less link.
export function liftLinks(md: string): string {
  return md.replace(/\[([^\]]+)\]\(((?!(?:https?:|mailto:|[a-z-]+:\/\/))[a-z-]+:[A-Za-z0-9_./#\-]+)\)/g, (_, label, id) => `⟦${label}|${cleanId(id)}⟧`);
}
// Split text runs on ⟦label|id⟧ markers into link inline content.
export function expandLinks(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (it.type !== 'text') { out.push(it); continue; }
    const t = it as InlineText; const re = /⟦([^|⟧]+)\|([^⟧]+)⟧/g; let last = 0; let m: RegExpExecArray | null; let any = false;
    while ((m = re.exec(t.text))) {
      any = true;
      if (m.index > last) out.push({ ...t, text: t.text.slice(last, m.index) });
      out.push({ type: 'link', href: m[2], content: [{ type: 'text', text: m[1], styles: t.styles }] } as unknown as Inline);
      last = m.index + m[0].length;
    }
    if (!any) { out.push(it); continue; }
    if (last < t.text.length) out.push({ ...t, text: t.text.slice(last) });
  }
  return out;
}

export function nodePropsFromChunk(chunk: { id: string; body: string }): { props: NodeProps; text: string } | null {
  const id = cleanId(chunk.id); if (!id.includes(':')) return null;
  const [kind, ...rest] = id.split(':'); const slug = rest.join(':');
  const rows = topLevel(chunk.body);
  const textKey = TEXT_KEYS.find(k => rows.has(k)) ?? 'title';
  const text = rows.get(textKey) ?? '';
  const status = (rows.get('status') ?? '').split(/\s+#/)[0].trim();
  return { props: { kind, slug, status, form: 'yaml', textKey, body: chunk.body, extra: '' }, text };
}

// Top-level yaml keys with flattened block scalars (enough to pick the text key and status).
function topLevel(body: string): Map<string, string> {
  const m = new Map<string, string>(); let cur: string | null = null; let block = false;
  for (const line of body.split('\n')) {
    const km = line.match(/^([A-Za-z][A-Za-z0-9 ()|_-]*?):(?:\s+(.*))?$/);
    if (km && !/^\s/.test(line)) { cur = km[1]; const raw = (km[2] ?? '').trim(); block = raw === '>' || raw === '|'; m.set(cur, block ? '' : raw); continue; }
    if (cur && block) m.set(cur, ((m.get(cur) ?? '') + ' ' + line.trim()).trim());
  }
  return m;
}

const text = (s: string): InlineText => ({ type: 'text', text: s, styles: {} });

// Expand markers and id-first paragraphs into node/divider blocks, then tag ids everywhere.
export function expand(blocks: AnyBlock[], yaml: Prepared['yaml'], drawings: Prepared['drawings'] = [], images: Prepared['images'] = [], views: Prepared['views'] = [], embeds: Prepared['embeds'] = [], tables: Prepared['tables'] = [], nested?: { contents: string[]; parseMd: ParseMd }): AnyBlock[] {
  const out: AnyBlock[] = [];
  // a block's lifted content (%%CONTENT:n%% at the end of its text) becomes its children, parsed with the whole pipeline
  const CONTENT_MARK = /\s*%%CONTENT:(\d+)%%\s*$/;
  const takeContent = (b: AnyBlock): AnyBlock[] | undefined => {
    if (!nested || !Array.isArray(b.content)) return undefined;
    const items = b.content as Inline[]; const last = items[items.length - 1];
    if (!last || last.type !== 'text') return undefined;
    const m = (last as InlineText).text.match(CONTENT_MARK); if (!m) return undefined;
    (last as InlineText).text = (last as InlineText).text.slice(0, m.index).replace(/\s+$/, '');
    const src = nested.contents[Number(m[1])]; return src ? nested.parseMd(src) : undefined;
  };
  let coll: AnyBlock | null = null; // the goals/tasks table being filled; blocks until %%/COLLECTION%% become its rows
  const push = (blk: AnyBlock) => { if (coll) coll.children!.push(blk); else out.push(blk); };
  for (const b of blocks) {
    const first = firstText(b);
    const cm = first.trim().match(/^%%COLLECTION:([a-z][a-z0-9-]*)(?::(\d+))?%%$/);
    if (b.type === 'paragraph' && cm) { const t = cm[2] ? tables[Number(cm[2])] : undefined; coll = { type: 'collection', props: t ? (t.view === 'list' ? { kind: cm[1], query: t.query, view: 'list' } : { kind: cm[1], query: t.query }) : { kind: cm[1] }, children: [] }; out.push(coll); continue; }
    if (b.type === 'paragraph' && /^%%\/COLLECTION%%$/.test(first.trim())) { coll = null; continue; }
    if ((b.type === 'paragraph') && /^%%DIVIDER%%$/.test(first.trim())) { push({ type: 'divider' }); continue; }
    const dm = first.trim().match(/^%%DRAWING:(\d+)%%$/);
    if (b.type === 'paragraph' && dm && drawings[Number(dm[1])]) { const dr = drawings[Number(dm[1])]; push({ type: 'drawing', props: { src: dr.src, title: dr.title } }); continue; }
    const vm = first.trim().match(/^%%VIEW:(\d+)%%$/);
    if (b.type === 'paragraph' && vm && views[Number(vm[1])]) { push({ type: 'view', props: { ...views[Number(vm[1])] } }); continue; }
    const em = first.trim().match(/^%%EMBED:(\d+)%%$/);
    if (b.type === 'paragraph' && em && embeds[Number(em[1])]) { push({ type: 'embed', props: { node: embeds[Number(em[1])] } }); continue; }
    const ym = first.trim().match(/^%%YAML:(\d+)%%(?:%%CONTENT:(\d+)%%)?$/);
    if (b.type === 'paragraph' && ym) {
      const chunks = yaml[Number(ym[1])] ?? [];
      chunks.forEach((chunk, k) => {
        const n = nodePropsFromChunk(chunk);
        const kids = k === chunks.length - 1 && ym[2] && nested ? nested.parseMd(nested.contents[Number(ym[2])] ?? '') : undefined;
        if (n) push({ type: 'node', props: n.props as unknown as Record<string, unknown>, content: [text(n.text)], ...(kids?.length ? { children: kids } : {}) });
        else push({ type: 'codeBlock', props: { language: 'yaml', code: chunk.body }, content: [] });
      });
      continue;
    }
    const kids = takeContent(b);
    const pn = proseNode(b, yaml, drawings);
    if (pn) { if (coll) { const cp = coll.props as { kind: string; view?: string }; pn.props = { ...pn.props, row: cp.view === 'list' ? '' : cp.kind }; } push(withLinks(kids?.length ? { ...pn, children: kids } : pn)); continue; }
    push(withLinks(kids?.length ? { ...b, children: kids } : b.children?.length ? { ...b, children: expand(b.children, yaml, drawings, images, views, embeds, tables, nested) } : b));
  }
  return (tagifyBlocks(out as never[]) as AnyBlock[]).map(b => unescapeBlock(imagifyBlock(b, images)));
}

// %%IMG:n%% placeholders (liftInlineImages) become img inline items — {url, alt} — inside their text run.
function imagifyInline(items: Inline[], images: Prepared['images']): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (it.type === 'text' && (it as InlineText).text.includes('%%IMG:')) {
      const t = it as InlineText; const re = /%%IMG:(\d+)%%/g; let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(t.text))) {
        const img = images[Number(m[1])];
        if (m.index > last) out.push({ type: 'text', text: t.text.slice(last, m.index), styles: t.styles });
        if (img) out.push({ type: 'img', props: { url: img.url, alt: img.alt } }); else out.push({ type: 'text', text: m[0], styles: t.styles });
        last = m.index + m[0].length;
      }
      if (last < t.text.length) out.push({ type: 'text', text: t.text.slice(last), styles: t.styles });
      continue;
    }
    if (it.type !== 'tag' && Array.isArray((it as InlineOther).content)) { out.push({ ...(it as InlineOther), content: imagifyInline((it as InlineOther).content as Inline[], images) }); continue; }
    out.push(it);
  }
  return out;
}
function imagifyBlock(b: AnyBlock, images: Prepared['images']): AnyBlock {
  if (!images.length) return b;
  let nb = b;
  if (Array.isArray(nb.content)) nb = { ...nb, content: imagifyInline(nb.content as Inline[], images) };
  const tc = nb.content as { rows?: { cells: unknown[] }[] } | undefined;
  if (tc && Array.isArray(tc.rows)) nb = { ...nb, content: { ...tc, rows: tc.rows.map(r => ({ ...r, cells: r.cells.map(c => Array.isArray(c) ? imagifyInline(c as Inline[], images) : (c && typeof c === 'object' && Array.isArray((c as { content?: unknown }).content)) ? { ...(c as object), content: imagifyInline((c as { content: Inline[] }).content, images) } : c) })) } };
  if (nb.children?.length) nb = { ...nb, children: nb.children.map(c => imagifyBlock(c, images)) };
  return nb;
}

// The escaped "<" from escapeAngles is decoded back so the editor shows the real character.
function unescapeInline(items: Inline[]): Inline[] {
  return items.map(it => it.type === 'text' ? { ...it, text: (it as InlineText).text.replace(/&lt;/g, '<').split(BS).join('\\').split(PIPE).join('|') } : (it.type !== 'tag' && Array.isArray((it as { content?: unknown }).content)) ? { ...it, content: unescapeInline((it as { content: Inline[] }).content) } : it);
}
// A code block's text (its `code` prop, component:code-block) gets the same restorations: the escaped "<", the held
// backslashes and pipes, and the lifted links back to `[label](id)` — code is verbatim, never tags.
export function restoreCode(text: string): string {
  return text.replace(/&lt;/g, '<').split(BS).join('\\').split(PIPE).join('|').replace(/⟦([^|⟧]+)\|([^⟧]+)⟧/g, '[$1]($2)');
}
function unescapeBlock(b: AnyBlock): AnyBlock {
  let nb = b;
  if (nb.type === 'codeBlock' && typeof (nb.props as { code?: unknown })?.code === 'string') nb = { ...nb, props: { ...nb.props, code: restoreCode((nb.props as { code: string }).code) } };
  if (Array.isArray(nb.content)) nb = { ...nb, content: unescapeInline(nb.content as Inline[]) };
  const tc = nb.content as { rows?: { cells: unknown[] }[] } | undefined;
  if (tc && Array.isArray(tc.rows)) nb = { ...nb, content: { ...tc, rows: tc.rows.map(r => ({ ...r, cells: r.cells.map(c => Array.isArray(c) ? unescapeInline(c as Inline[]) : (c && typeof c === 'object' && Array.isArray((c as { content?: unknown }).content)) ? { ...(c as object), content: unescapeInline((c as { content: Inline[] }).content) } : c) })) } };
  if (nb.children?.length) nb = { ...nb, children: nb.children.map(unescapeBlock) };
  return nb;
}

function withLinks(b: AnyBlock): AnyBlock {
  if (Array.isArray(b.content)) return { ...b, content: expandLinks(b.content as Inline[]) };
  const tc = b.content as { rows?: { cells: unknown[] }[] } | undefined;
  if (tc && Array.isArray(tc.rows)) return { ...b, content: { ...tc, rows: tc.rows.map(r => ({ ...r, cells: r.cells.map(c => Array.isArray(c) ? expandLinks(c as Inline[]) : (c && typeof c === 'object' && Array.isArray((c as { content?: unknown }).content)) ? { ...(c as object), content: expandLinks((c as { content: Inline[] }).content) } : c) })) } };
  return b;
}

function firstText(b: AnyBlock): string {
  const c = b.content; if (!Array.isArray(c)) return '';
  return (c as Inline[]).map(i => i.type === 'text' ? (i as InlineText).text : '').join('');
}

// A paragraph or list item whose content starts with "kind:slug " becomes a prose node block.
function proseNode(b: AnyBlock, yaml: Prepared['yaml'], drawings: Prepared['drawings'] = []): AnyBlock | null {
  if (!['paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'].includes(b.type) || !Array.isArray(b.content)) return null;
  const items = b.content as Inline[];
  const head = items[0];
  if (!head || head.type !== 'text') return null;
  // an id alone — a block added with nothing typed yet — is a node block with empty text too (the parser agrees)
  const m = (head as InlineText).text.match(new RegExp('^(' + ID_RE.source + ')(?:\\s+|$)'));
  if (!m) return null;
  if (m[0] === m[1] && (items.length > 1 || (head as InlineText).text.trim() !== m[1])) return null;   // the id is the whole line, not the start of a longer run
  const id = cleanId(m[1]); const [kind, ...rest] = id.split(':');
  const restItems: Inline[] = [{ ...(head as InlineText), text: (head as InlineText).text.slice(m[0].length) }, ...items.slice(1)];
  // status hashtag and trailing (k: v) group live in the last text run
  let status = ''; let extra = '';
  const last = restItems[restItems.length - 1];
  if (last && last.type === 'text') {
    let s = (last as InlineText).text;
    const g = s.match(EXTRA_GROUP); if (g) { extra = g[1]; s = s.slice(0, g.index); }
    // the status is the tag at the end of the text (after the props group), never one inside a sentence
    for (let m; (m = s.match(TRAILING_STATUS)); ) { status = m[1]; s = s.slice(0, m.index); }
    restItems[restItems.length - 1] = { ...(last as InlineText), text: s.replace(/\s+$/, '') };
  }
  const check: NodeProps['check'] = b.type === 'checkListItem' ? ((b.props as { checked?: boolean })?.checked ? 'done' : 'todo') : '';
  if (check && !status) status = check === 'done' ? 'done' : 'open';
  const list: NodeProps['list'] = check ? '' : b.type === 'bulletListItem' ? 'bullet' : b.type === 'numberedListItem' ? 'number' : '';
  const props: NodeProps = { kind, slug: rest.join(':'), status, form: 'prose', textKey: 'text', body: '', extra, check, list };
  // nested list items under the node (details, sub-tasks) stay its children; nested ids become nodes too
  return { type: 'node', props: props as unknown as Record<string, unknown>, content: restItems, children: b.children?.length ? expand(b.children, yaml, drawings) : b.children };
}

// The whole import for one level: prepare, BlockNote's markdown parser (passed in — it lives in the editor), expand;
// a block's content goes through the same three steps, so the tree is built the same way at every depth.
export function importMarkdown(md: string, tryParse: (md: string) => AnyBlock[]): AnyBlock[] {
  const p = prepare(md);
  const parseMd: ParseMd = src => importMarkdown(src, tryParse);
  return expand(tryParse(p.md), p.yaml, p.drawings, p.images, p.views, p.embeds, p.tables, { contents: p.contents, parseMd });
}
