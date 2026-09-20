// BlockNote blocks → markdown, under our control (BlockNote's own export is lossy). Pure; typed loosely so it can
// run on plain JSON in tests. Node blocks (our custom block) become prose lines or yaml blocks.
import type { Inline } from './mdflow';

// A table region's marker names the kind of its rows: goals, tasks, or table:<type slug> for a product's own type.
export const collectionKind = (marker: string) => marker === 'goals' ? 'goal' : marker === 'tasks' ? 'task' : marker.replace(/^(table|list):/, '');
// a list region (`<!-- list:task -->`) shows its rows as ordinary blocks, a table region as rows (rule:list-view)
export const collectionView = (marker: string): 'table' | 'list' => marker.startsWith('list:') ? 'list' : 'table';
export const collectionMarker = (kind: string, view?: string) => view === 'list' ? `list:${kind}` : kind === 'goal' ? 'goals' : kind === 'task' ? 'tasks' : `table:${kind}`;

export interface NodeProps { kind: string; slug: string; status: string; form: 'prose' | 'yaml'; textKey: string; body: string; extra: string; check?: '' | 'todo' | 'done'; list?: '' | 'bullet' | 'number'; row?: '' | 'goal' | 'task' }
export interface AnyBlock { type: string; props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] }

export function inlineToMarkdown(items: Inline[] | undefined): string {
  if (!items) return '';
  return items.map(it => {
    if (it.type === 'text') { const t = it as { text: string; styles: Record<string, unknown> }; return styled(t.text, t.styles); }
    if (it.type === 'tag') return (it as { props: { id: string } }).props.id;
    if (it.type === 'img') { const im = (it as unknown as { props: { url: string; alt: string } }).props; return `![${im.alt ?? ''}](${im.url})`; }
    if (it.type === 'link') { const l = it as unknown as { href: string; content: Inline[] }; return `[${inlineToMarkdown(l.content)}](${l.href})`; }
    return '';
  }).join('');
}
function styled(text: string, st: Record<string, unknown> = {}): string {
  if (!text) return '';
  if (st.code) return '`' + text + '`';
  let t = text;
  if (st.bold) t = `**${t}**`;
  if (st.italic) t = `*${t}*`;
  if (st.strike) t = `~~${t}~~`;
  return t;
}

// n: position of a numbered item among its numbered siblings (1-based).
export function nodeToMarkdown(p: NodeProps, text: string, n = 1): string[] {
  const id = `${p.kind}:${p.slug}`;
  if (p.form === 'prose') {
    const box = p.check === 'done' ? '- [x] ' : p.check === 'todo' ? '- [ ] ' : p.list === 'bullet' ? '- ' : p.list === 'number' ? `${n}. ` : '';
    const implied = p.check === 'done' ? 'done' : p.check === 'todo' ? 'open' : '';
    const status = p.status && p.status !== implied ? ' #' + p.status : '';
    return [`${box}${id} ${text.trim()}${status}${p.extra ? ' (' + p.extra + ')' : ''}`];
  }
  // yaml form: rewrite the text key and status inside the original body, keeping every other line in place.
  const lines = p.body ? p.body.split('\n') : [`id: ${id}`];
  const out: string[] = []; let i = 0; let sawText = false, sawStatus = false;
  const textLines = (key: string) => text.includes('\n') || text.length > 100 ? [`${key}: >`, ...wrap(text, 110).map(l => '  ' + l)] : [`${key}: ${text.trim()}`];
  while (i < lines.length) {
    const l = lines[i];
    const km = l.match(/^([A-Za-z][A-Za-z0-9 ()|_-]*?):(?:\s+(.*))?$/);
    if (km && km[1] === p.textKey) { out.push(...textLines(p.textKey)); sawText = true; i++; while (i < lines.length && /^\s/.test(lines[i])) i++; continue; }
    if (km && km[1] === 'status') {
      const orig = (km[2] ?? '').split(/\s+#/)[0].trim(); const comment = (km[2] ?? '').match(/\s+#.*$/)?.[0] ?? '';
      if (p.status) out.push(`status: ${p.status}${orig === p.status ? comment : ''}`);
      sawStatus = true; i++; continue;
    }
    out.push(l); i++;
  }
  if (!sawText && text.trim()) out.splice(1, 0, ...textLines(p.textKey || 'title'));
  if (!sawStatus && p.status) out.push(`status: ${p.status}`);
  if (!/^id:/.test(out[0] ?? '')) out.unshift(`id: ${id}`);
  return out;
}

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s*\n\s*/g, ' ').split(' ');
  const lines: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > width && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines;
}

export function blocksToMarkdown(blocks: AnyBlock[]): string {
  const out: string[] = [];
  let i = 0; let n = 0; // n counts consecutive numbered items
  const push = (...s: string[]) => { out.push(...s); };
  const isNumbered = (x: AnyBlock) => x.type === 'numberedListItem' || (x.type === 'node' && (x.props as unknown as NodeProps).list === 'number');
  const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'node' && (b.props as unknown as NodeProps).form === 'yaml') {
      // merge consecutive yaml nodes into one fenced block, list style
      // a card with content is alone at the end of its fence: its content follows the fence, indented (rule:content-lines)
      const group: AnyBlock[] = [];
      while (i < blocks.length && blocks[i].type === 'node' && (blocks[i].props as unknown as NodeProps).form === 'yaml') { group.push(blocks[i++]); if (group[group.length - 1].children?.length) break; }
      blank(); push('```yaml');
      for (const nb of group) {
        const lines = nodeToMarkdown(nb.props as unknown as NodeProps, inlineToMarkdown(nb.content as Inline[]));
        lines.forEach((l, k) => push((k === 0 ? '- ' : '  ') + l));
      }
      push('```');
      const last = group[group.length - 1];
      if (last.children?.length) { blank(); push(...contentLines(last.children).filter((l, k) => k > 0 || l !== '')); }
      blank(); continue;
    }
    i++;
    n = isNumbered(b) ? n + 1 : 0;
    switch (b.type) {
      case 'node': {
        const np = b.props as unknown as NodeProps;
        const lines = nodeToMarkdown(np, inlineToMarkdown(b.content as Inline[]), n);
        const kids = contentLines(b.children);
        if (np.check || np.list) { const prevList = out.length && inList(out[out.length - 1]); if (!prevList) blank(); push(...lines, ...kids); if (kids.length && !isItem(kids[kids.length - 1])) blank(); }
        else { blank(); push(...lines, ...kids); blank(); }
        break;
      }
      case 'paragraph': { const t = inlineToMarkdown(b.content as Inline[]); if (t.trim()) { blank(); push(t); blank(); } break; }
      case 'heading': { const lvl = Number((b.props as { level?: number })?.level ?? 1); blank(); push('#'.repeat(lvl) + ' ' + inlineToMarkdown(b.content as Inline[])); blank(); break; }
      case 'bulletListItem': case 'numberedListItem': case 'checkListItem': {
        const prevList = out.length && inList(out[out.length - 1]);
        if (!prevList) blank();
        const kids = contentLines(b.children);
        push(...listLines(b, 0, n), ...kids); if (kids.length && !isItem(kids[kids.length - 1])) blank(); break;
      }
      case 'table': { blank(); push(...tableLines(b)); blank(); break; }
      case 'codeBlock': { blank(); const lang = String((b.props as { language?: string })?.language ?? ''); push('```' + (lang === 'text' ? '' : lang)); push(...plainText(b.content as Inline[]).split('\n')); push('```'); blank(); break; }
      case 'quote': { blank(); push(...inlineToMarkdown(b.content as Inline[]).split('\n').map(l => '> ' + l)); blank(); break; }
      case 'divider': { blank(); push('---'); blank(); break; }
      case 'collection': { // a goals/tasks/type table: its rows are node blocks, written as plain list lines inside comment markers
        const cp = b.props as { kind?: string; query?: string; view?: string };
        const ck = collectionMarker(cp.kind ?? 'goal', cp.view);
        blank(); push(`<!-- ${ck}${cp.query?.trim() ? ' ' + cp.query.trim() : ''} -->`); // the filters ride on the opening marker (rule:table-filter)
        // the editor keeps an empty row at the end for typing the next item; rows without text are not written
        const rows = (b.children ?? []).filter(c => c.type !== 'node' || (inlineToMarkdown(c.content as Inline[]).trim() && (c.props as unknown as NodeProps).slug));
        push(...childrenLines(rows.map(c => c.type === 'node' && !(c.props as unknown as NodeProps).check && !(c.props as unknown as NodeProps).list ? { ...c, props: { ...c.props, list: 'bullet' } } : c), 0));
        push(`<!-- /${ck} -->`); blank(); break;
      }
      case 'drawing': { const dp = b.props as { src?: string; title?: string }; blank(); push(`![${dp.title ?? ''}](${dp.src ?? ''})`); blank(); break; }
      case 'embed': { const ep = b.props as { node?: string }; if (ep.node) { blank(); push(`![[${ep.node}]]`); blank(); } break; }
      case 'view': { const vp = b.props as { slug?: string; query?: string }; blank(); push(`<!-- view:${vp.slug ?? ''}${vp.query?.trim() ? ' ' + vp.query.trim() : ''} -->`); blank(); break; }
      case 'image': case 'video': case 'audio': case 'file': { const fp = b.props as { url?: string; caption?: string; name?: string }; if (fp.url) { blank(); push(`![${fp.caption || fp.name || ''}](${fp.url})`); blank(); } break; }
      default: { const t = inlineToMarkdown(b.content as Inline[]); if (t.trim()) { blank(); push(t); blank(); } }
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

// The previous line belongs to a list when it carries a marker or is an indented continuation.
const inList = (l: string) => /^(\s*)([-*]|\d+\.)\s|^\s+\S/.test(l);

function listLines(b: AnyBlock, depth: number, n = 1): string[] {
  const pad = '  '.repeat(depth);
  const marker = b.type === 'numberedListItem' ? `${n}. ` : b.type === 'checkListItem' ? ((b.props as { checked?: boolean })?.checked ? '- [x] ' : '- [ ] ') : '- ';
  return [pad + marker + inlineToMarkdown(b.content as Inline[])];
}

// A block's content (req:ontology.content): its children written as a document of their own and indented two
// spaces under the block's line — the same rules at every level, so a paragraph, a fence or a card nests like a
// list item does. A list first keeps the line tight under its parent; anything else starts after a blank line,
// which is what tells the parser it is content and not the parent's continuation text.
export function contentLines(children: AnyBlock[] | undefined): string[] {
  if (!children?.length) return [];
  const inner = blocksToMarkdown(children).replace(/\n$/, '').split('\n').map(l => l ? '  ' + l : l);
  return isItem(inner[0]) ? inner : ['', ...inner];
}
const isItem = (l: string) => /^\s*([-*+]|\d+[.)])\s/.test(l);

// The rows of a table region (collection): list-form nodes at depth 0, their content under them.
function childrenLines(children: AnyBlock[] | undefined, depth: number): string[] {
  const pad = '  '.repeat(depth);
  const lines: string[] = []; let n = 0;
  for (const c of children ?? []) {
    const numbered = c.type === 'numberedListItem' || (c.type === 'node' && (c.props as unknown as NodeProps).list === 'number');
    n = numbered ? n + 1 : 0;
    if (c.type.endsWith('ListItem')) lines.push(...listLines(c, depth, n), ...contentLines(c.children).map(l => l ? pad + l : l));
    else if (c.type === 'node') lines.push(...nodeToMarkdown(c.props as unknown as NodeProps, inlineToMarkdown(c.content as Inline[]), n).map(l => pad + l), ...contentLines(c.children).map(l => l ? pad + l : l));
    else lines.push(pad + inlineToMarkdown(c.content as Inline[]));
  }
  return lines;
}

function plainText(items: Inline[] | undefined): string {
  return (items ?? []).map(it => it.type === 'text' ? (it as { text: string }).text : it.type === 'tag' ? (it as { props: { id: string } }).props.id : '').join('');
}

function tableLines(b: AnyBlock): string[] {
  const content = b.content as { rows?: { cells: unknown[] }[] } | undefined;
  const rows = (content?.rows ?? []).map(r => r.cells.map(c => cellText(c)));
  const kept = rows.filter(r => r.some(c => c.trim()));
  if (!kept.length) return [];
  const width = Math.max(...kept.map(r => r.length));
  const line = (r: string[]) => '| ' + Array.from({ length: width }, (_, k) => (r[k] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |';
  return [line(kept[0]), '|' + Array.from({ length: width }, () => '---').join('|') + '|', ...kept.slice(1).map(line)];
}
function cellText(c: unknown): string {
  if (Array.isArray(c)) return inlineToMarkdown(c as Inline[]);
  if (c && typeof c === 'object' && Array.isArray((c as { content?: unknown }).content)) return inlineToMarkdown((c as { content: Inline[] }).content);
  return '';
}
