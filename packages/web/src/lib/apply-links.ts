// Links applied in the editor (Jev auto-linking design §3), pure and client-safe: a paragraph or a prose node gets the
// ids as smart tags at its end (the prose convention — a tag in text is a related-to edge); a yaml card gets them
// merged into related-to in its body. Code, embeds, drawings and blocks not in the map are untouched.
type Inline = { type: string; text?: string; props?: { id?: string }; href?: string; content?: { text?: string }[]; styles?: Record<string, unknown> };
export type LinkBlock = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: LinkBlock[] };

const TEXT_TYPES = new Set(['paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem', 'heading', 'node']);

// the plain text of a block's inline content: text runs and link labels, tags left out
export function blockText(b: LinkBlock): string {
  if (!Array.isArray(b.content)) return '';
  return (b.content as Inline[]).map(i => i.type === 'text' ? i.text ?? '' : i.type === 'link' ? (i.content ?? []).map(c => c.text ?? '').join('') : '').join('');
}
// the ids a block already carries: its tags, its id-links, and its own id when it is a node block
export function blockLinked(b: LinkBlock): string[] {
  const items = Array.isArray(b.content) ? (b.content as Inline[]) : [];
  const linked = items.flatMap(i => i.type === 'tag' && i.props?.id ? [i.props.id] : i.type === 'link' && i.href && /^[a-z-]+:/.test(i.href) ? [i.href] : []);
  const np = b.type === 'node' ? (b.props as { kind?: string; slug?: string }) : null;
  if (np?.slug) linked.push(`${np.kind}:${np.slug}`);
  return linked;
}

function relatedOf(body: string): string[] {
  const line = body.split('\n').find(l => /^\s*related-to:/.test(l)); if (!line) return [];
  return (line.match(/\[(.*)\]/)?.[1] ?? line.replace(/^\s*related-to:\s*/, '')).split(/[,\s]+/).filter(Boolean);
}
function mergeRelated(body: string, ids: string[]): string {
  const lines = body.split('\n'); const i = lines.findIndex(l => /^\s*related-to:/.test(l));
  const cur = relatedOf(body);
  const all = [...cur, ...ids.filter(id => !cur.includes(id))];
  if (all.length === cur.length) return body;
  const line = `${i >= 0 ? lines[i].match(/^\s*/)![0] : ''}related-to: [${all.join(', ')}]`;
  if (i >= 0) lines[i] = line; else lines.push(line);
  return lines.join('\n');
}

export function applyLinks<T extends LinkBlock>(blocks: T[], links: Record<string, string[]>): { blocks: T[]; changed: boolean } {
  let changed = false;
  const out = blocks.map(b => {
    const ids = b.id ? links[b.id] : undefined; if (!ids?.length || !TEXT_TYPES.has(b.type)) return b;
    const props = b.props as { form?: string; body?: string } | undefined;
    const have = [...blockLinked(b), ...(b.type === 'node' && props?.form === 'yaml' ? relatedOf(props.body ?? '') : [])];
    const fresh = ids.filter(id => !have.includes(id)); if (!fresh.length) return b;
    if (b.type === 'node' && props?.form === 'yaml') {
      const body = mergeRelated(props.body ?? '', fresh); if (body === (props.body ?? '')) return b;
      changed = true; return { ...b, props: { ...b.props, body } };
    }
    if (!Array.isArray(b.content)) return b;
    changed = true;
    const tail = fresh.flatMap(id => [{ type: 'text', text: ' ', styles: {} }, { type: 'tag', props: { id } }]);
    return { ...b, content: [...(b.content as unknown[]), ...tail] };
  });
  return { blocks: out, changed };
}
