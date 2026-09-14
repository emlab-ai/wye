// Markdown → editor blocks, in two steps: `prepare` (pure) lifts yaml blocks and rules out of the markdown and
// leaves markers; after BlockNote parses the rest in the browser, `expand` (pure) turns markers into divider and
// node blocks, turns id-first paragraphs into prose node blocks, and tags ids.
import { ID_RE, cleanId } from './ids';
import { splitDocument } from './doc';
import { tagifyBlocks, unwrapParagraphs, type Inline, type InlineText } from './mdflow';
import type { AnyBlock, NodeProps } from './serialize';

const TEXT_KEYS = ['title', 'statement', 'description', 'purpose', 'q', 'text', 'context', 'does', 'intent'];
const STATUS_TAG = /(?:^|\s)#(proposed|approved|shipped|unverified|api-only|deprecated|question|drift|done|in-progress|blocked)\b/;

export interface Prepared { md: string; yaml: { id: string; body: string }[][] }

// Replace yaml blocks with %%YAML:n%% paragraphs and --- rules with %%DIVIDER%% paragraphs; unwrap prose.
export function prepare(body: string): Prepared {
  const split = splitDocument(body); // the body has no frontmatter; only its segments matter
  const yaml: { id: string; body: string }[][] = [];
  const parts: string[] = [];
  for (const s of split.segments) {
    if (s.type === 'yaml') { yaml.push(s.chunks.map(c => ({ id: c.id ?? '', body: c.body }))); parts.push(`%%YAML:${yaml.length - 1}%%`); }
    else if (s.type === 'hr') parts.push('%%DIVIDER%%');
    else parts.push(unwrapParagraphs(s.text));
  }
  return { md: parts.join('\n\n'), yaml };
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
export function expand(blocks: AnyBlock[], yaml: Prepared['yaml']): AnyBlock[] {
  const out: AnyBlock[] = [];
  for (const b of blocks) {
    const first = firstText(b);
    if ((b.type === 'paragraph') && /^%%DIVIDER%%$/.test(first.trim())) { out.push({ type: 'divider' }); continue; }
    const ym = first.trim().match(/^%%YAML:(\d+)%%$/);
    if (b.type === 'paragraph' && ym) {
      for (const chunk of yaml[Number(ym[1])] ?? []) {
        const n = nodePropsFromChunk(chunk);
        if (n) out.push({ type: 'node', props: n.props as unknown as Record<string, unknown>, content: [text(n.text)] });
        else out.push({ type: 'codeBlock', props: { language: 'yaml' }, content: [text(chunk.body)] });
      }
      continue;
    }
    const pn = proseNode(b);
    if (pn) { out.push(pn); continue; }
    out.push(b.children?.length ? { ...b, children: expand(b.children, yaml) } : b);
  }
  return tagifyBlocks(out as never[]) as AnyBlock[];
}

function firstText(b: AnyBlock): string {
  const c = b.content; if (!Array.isArray(c)) return '';
  return (c as Inline[]).map(i => i.type === 'text' ? (i as InlineText).text : '').join('');
}

// A paragraph or list item whose content starts with "kind:slug " becomes a prose node block.
function proseNode(b: AnyBlock): AnyBlock | null {
  if (!['paragraph', 'bulletListItem', 'numberedListItem'].includes(b.type) || !Array.isArray(b.content)) return null;
  const items = b.content as Inline[];
  const head = items[0];
  if (!head || head.type !== 'text') return null;
  const m = (head as InlineText).text.match(new RegExp('^(' + ID_RE.source + ')\\s+'));
  if (!m) return null;
  const id = cleanId(m[1]); const [kind, ...rest] = id.split(':');
  const restItems: Inline[] = [{ ...(head as InlineText), text: (head as InlineText).text.slice(m[0].length) }, ...items.slice(1)];
  // status hashtag and trailing (k: v) group live in the last text run
  let status = ''; let extra = '';
  const last = restItems[restItems.length - 1];
  if (last && last.type === 'text') {
    let s = (last as InlineText).text;
    const g = s.match(/\s*\(([a-z-]+:\s*[^()]*?(?:,\s*[a-z-]+:\s*[^()]*?)*)\)\s*$/); if (g) { extra = g[1]; s = s.slice(0, g.index); }
    s = s.replace(STATUS_TAG, (_, st) => { status = st; return ''; });
    restItems[restItems.length - 1] = { ...(last as InlineText), text: s.replace(/\s+$/, '') };
  }
  const props: NodeProps = { kind, slug: rest.join(':'), status, form: 'prose', textKey: 'text', body: '', extra };
  return { type: 'node', props: props as unknown as Record<string, unknown>, content: restItems, children: b.children };
}
