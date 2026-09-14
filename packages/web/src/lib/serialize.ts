// BlockNote blocks → markdown, under our control (BlockNote's own export is lossy). Pure; typed loosely so it can
// run on plain JSON in tests. Node blocks (our custom block) become prose lines or yaml blocks.
import type { Inline } from './mdflow';

export interface NodeProps { kind: string; slug: string; status: string; form: 'prose' | 'yaml'; textKey: string; body: string; extra: string; check?: '' | 'todo' | 'done'; list?: '' | 'bullet' }
export interface AnyBlock { type: string; props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] }

export function inlineToMarkdown(items: Inline[] | undefined): string {
  if (!items) return '';
  return items.map(it => {
    if (it.type === 'text') { const t = it as { text: string; styles: Record<string, unknown> }; return styled(t.text, t.styles); }
    if (it.type === 'tag') return (it as { props: { id: string } }).props.id;
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

export function nodeToMarkdown(p: NodeProps, text: string): string[] {
  const id = `${p.kind}:${p.slug}`;
  if (p.form === 'prose') {
    const box = p.check === 'done' ? '- [x] ' : p.check === 'todo' ? '- [ ] ' : p.list === 'bullet' ? '- ' : '';
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
  let i = 0;
  const push = (...s: string[]) => { out.push(...s); };
  const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'node' && (b.props as unknown as NodeProps).form === 'yaml') {
      // merge consecutive yaml nodes into one fenced block, list style
      const group: AnyBlock[] = [];
      while (i < blocks.length && blocks[i].type === 'node' && (blocks[i].props as unknown as NodeProps).form === 'yaml') group.push(blocks[i++]);
      blank(); push('```yaml');
      for (const nb of group) {
        const lines = nodeToMarkdown(nb.props as unknown as NodeProps, inlineToMarkdown(nb.content as Inline[]));
        lines.forEach((l, k) => push((k === 0 ? '- ' : '  ') + l));
      }
      push('```'); blank(); continue;
    }
    i++;
    switch (b.type) {
      case 'node': {
        const np = b.props as unknown as NodeProps;
        const lines = nodeToMarkdown(np, inlineToMarkdown(b.content as Inline[]));
        if (np.check || np.list) { const prevList = out.length && /^(\s*)([-*]|\d+\.)\s/.test(out[out.length - 1]); if (!prevList) blank(); push(...lines); }
        else { blank(); push(...lines); blank(); }
        break;
      }
      case 'paragraph': { const t = inlineToMarkdown(b.content as Inline[]); if (t.trim()) { blank(); push(t); blank(); } break; }
      case 'heading': { const lvl = Number((b.props as { level?: number })?.level ?? 1); blank(); push('#'.repeat(lvl) + ' ' + inlineToMarkdown(b.content as Inline[])); blank(); break; }
      case 'bulletListItem': case 'numberedListItem': case 'checkListItem': {
        const prevList = out.length && /^(\s*)([-*]|\d+\.)\s/.test(out[out.length - 1]);
        if (!prevList) blank();
        push(...listLines(b, 0)); break;
      }
      case 'table': { blank(); push(...tableLines(b)); blank(); break; }
      case 'codeBlock': { blank(); const lang = String((b.props as { language?: string })?.language ?? ''); push('```' + (lang === 'text' ? '' : lang)); push(...plainText(b.content as Inline[]).split('\n')); push('```'); blank(); break; }
      case 'quote': { blank(); push(...inlineToMarkdown(b.content as Inline[]).split('\n').map(l => '> ' + l)); blank(); break; }
      case 'divider': { blank(); push('---'); blank(); break; }
      default: { const t = inlineToMarkdown(b.content as Inline[]); if (t.trim()) { blank(); push(t); blank(); } }
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

function listLines(b: AnyBlock, depth: number): string[] {
  const pad = '  '.repeat(depth);
  const marker = b.type === 'numberedListItem' ? '1. ' : b.type === 'checkListItem' ? ((b.props as { checked?: boolean })?.checked ? '- [x] ' : '- [ ] ') : '- ';
  const lines = [pad + marker + inlineToMarkdown(b.content as Inline[])];
  for (const c of b.children ?? []) lines.push(...(c.type.endsWith('ListItem') ? listLines(c, depth + 1) : [pad + '  ' + inlineToMarkdown(c.content as Inline[])]));
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
