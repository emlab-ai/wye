// Obsidian-style links in imported notes (decision:wf2.wikilinks-to-links): `[[Note]]`, `[[Note|shown text]]`,
// `[[Note#Heading]]`, `[[Folder/Note]]` and embeds `![[picture.png]]` become Wye's own links — `[shown text](id)`,
// a tag the graph follows — when the name is something the product has: a person, project or the like under that
// name or alias (the knowledge model first), else a page by its file name or title. An image embed becomes a plain
// image the import copies. A name nothing matches stays `[[Name]]`, so no link is lost. Code is left alone. Pure.

export type Resolve = (name: string) => string | null;

// a name as Obsidian matches it: case-insensitive, no extension, no folder when the bare name is asked for,
// `_` and `-` as spaces, a leading `_` (a "private" note) dropped
export const nameKey = (s: string) => s.trim().replace(/\.md$/i, '').replace(/^_+/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const LINK = /(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g;

export function convertWikilinks(text: string, resolve: Resolve): { text: string; resolved: number; unresolved: string[] } {
  let resolved = 0; const unresolved: string[] = [];
  const conv = (chunk: string) => chunk.replace(LINK, (whole, bang: string, name: string, _heading: string | undefined, alias: string | undefined) => {
    const target = name.trim(); const shown = (alias ?? target.split('/').pop() ?? target).trim();
    if (bang && IMAGE.test(target)) { resolved++; return `![${alias?.trim() ?? ''}](${encodeURI(target)})`; }
    const id = resolve(target) ?? (target.includes('/') ? resolve(target.split('/').pop()!) : null);
    if (!id) { unresolved.push(target); return whole; }
    resolved++;
    return `[${shown.replace(/[[\]]/g, '')}](${id})`;
  });
  // fenced code and inline code stay as written
  const out = text.split(/(^```[\s\S]*?^```[^\n]*$)/m).map((part, i) => i % 2 ? part : part.split(/(`[^`\n]*`)/).map((p, j) => j % 2 ? p : conv(p)).join('')).join('');
  return { text: out, resolved, unresolved: [...new Set(unresolved)] };
}

export type Named = { id: string; names: string[] };

// The two lookups an import uses, from a graph: its things, its pages.
export function graphLinks(graph: { nodes: Parameters<typeof graphNames>[0]; modules: Parameters<typeof graphNames>[1] }): { entities: Resolve; pages: Resolve } {
  const g = graphNames(graph.nodes, graph.modules);
  return { entities: resolver(g.entities), pages: resolver(g.pages) };
}

// One lookup over several sources, in order: the first that knows a name wins.
export function resolver(...sources: Named[][]): Resolve {
  const maps = sources.map(src => { const m = new Map<string, string>(); for (const e of src) for (const n of e.names) { const k = nameKey(n); if (k && !m.has(k)) m.set(k, e.id); } return m; });
  return name => { const k = nameKey(name); for (const m of maps) { const id = m.get(k); if (id) return id; } return null; };
}

const line = (body: string | undefined, key: string) => body?.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
const ENTITY_SKIP = new Set(['block', 'prop', 'module', 'type', 'kind', 'skill', 'hook', 'workflow', 'stage', 'task', 'question', 'decision', 'constraint', 'req', 'rule', 'lesson', 'consequence', 'context', 'alternative', 'statement', 'choice', 'idea', 'contribution', 'rationale', 'test', 'pr']);

// What the graph knows by name: things of the product's own types (title, name, aliases), then its pages (title,
// and the file an import came from — `source: import/<path>`).
export function graphNames(nodes: { id: string; kind: string; title: string; body?: string; defined?: boolean }[], modules: { id: string; title: string; file?: string }[]): { entities: Named[]; pages: Named[] } {
  const typed = new Set(nodes.filter(n => n.kind === 'type').map(n => n.id.slice(5)));
  const entities = nodes.filter(n => n.defined && typed.has(n.kind) && !ENTITY_SKIP.has(n.kind)).map(n => {
    const aliases = (line(n.body, 'aliases') ?? '').replace(/^\[|\]$/g, '').split(',').map(a => a.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    return { id: n.id, names: [n.title, line(n.body, 'name') ?? '', ...aliases].filter(Boolean) };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const pages = modules.map(m => {
    const src = line(byId.get(m.id)?.body, 'source')?.replace(/^"|"$/g, '');
    const from = src?.startsWith('import/') ? src.slice(7) : '';
    return { id: m.id, names: [m.title.replace(/^"|"$/g, ''), from ? from.split('/').pop()! : '', from].filter(Boolean) };
  });
  return { entities, pages };
}
