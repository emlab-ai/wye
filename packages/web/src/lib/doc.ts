import { STRUCTURAL, type GraphData, type GraphIndex, type GraphNode } from './graph';

export interface Chunk { id: string | null; body: string; raw: string; start: number; end: number; list: boolean }
export type Segment =
  | { type: 'markdown'; text: string; start: number; end: number }
  | { type: 'hr'; start: number; end: number }
  | { type: 'yaml'; raw: string; chunks: Chunk[]; start: number; end: number };
export interface SplitDoc { frontmatter: Record<string, string>; segments: Segment[] }
export interface DocNode { module: GraphNode; file: string; slug: string; title: string; children: DocNode[] }
export type IndexEntry = { id: string; kind: string; title: string; status: string; defined: boolean; file: string; owner?: string; target?: string; progress?: number; parts?: { done: number; total: number }; parent?: string; sessions?: string[] };

export const DONE_STATUSES = new Set(['done', 'shipped', 'complete']);

export function docSlug(file: string): string { return file.split('/').pop()!.replace(/\.md$/, ''); }

export function headingSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function splitDocument(md: string): SplitDoc {
  const frontmatter: Record<string, string> = {};
  let offset = 0;
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    offset = fm[0].length;
    for (const line of fm[1].split('\n')) { const m = line.match(/^([\w-]+):\s*(.*)$/); if (m) frontmatter[m[1]] = m[2].trim(); }
  }
  const segments: Segment[] = [];
  // Walk lines keeping absolute character offsets so writers can replace exact spans.
  const lines: { text: string; start: number }[] = [];
  let pos = offset;
  for (const text of md.slice(offset).split('\n')) { lines.push({ text, start: pos }); pos += text.length + 1; }
  let buf: { text: string; start: number }[] = []; let inYaml = false; let inOther = false; let yamlBuf: { text: string; start: number }[] = []; let fenceStart = 0;
  const flushMd = () => {
    let a = 0, b = buf.length;
    while (a < b && !buf[a].text.trim()) a++;
    while (b > a && !buf[b - 1].text.trim()) b--;
    if (a < b) { const start = buf[a].start; const end = buf[b - 1].start + buf[b - 1].text.length; segments.push({ type: 'markdown', text: md.slice(start, end), start, end }); }
    buf = [];
  };
  const flushYaml = (fenceEnd: number) => {
    segments.push({ type: 'yaml', raw: yamlBuf.map(l => l.text).join('\n'), chunks: chunkYaml(yamlBuf), start: fenceStart, end: fenceEnd });
    yamlBuf = [];
  };
  for (const line of lines) {
    if (/^```/.test(line.text)) {
      if (inYaml) { inYaml = false; flushYaml(line.start + line.text.length); continue; }
      if (inOther) { inOther = false; buf.push(line); continue; }
      if (/^```ya?ml/.test(line.text)) { flushMd(); inYaml = true; fenceStart = line.start; continue; }
      inOther = true; buf.push(line); continue;
    }
    if (inYaml) { yamlBuf.push(line); continue; }
    if (!inOther && /^---\s*$/.test(line.text)) { flushMd(); segments.push({ type: 'hr', start: line.start, end: line.start + line.text.length }); continue; }
    buf.push(line);
  }
  if (inYaml) flushYaml(md.length);
  flushMd();
  return { frontmatter, segments };
}

function chunkYaml(lines: { text: string; start: number }[]): Chunk[] {
  const groups: { id: string | null; lines: { text: string; start: number }[] }[] = [];
  let cur: { id: string | null; lines: { text: string; start: number }[] } | null = null;
  for (const line of lines) {
    const idm = line.text.match(/^\s*-?\s*id:\s*([a-z-]+:[A-Za-z0-9_./#\-]+)/);
    if (idm) { if (cur) groups.push(cur); cur = { id: idm[1], lines: [line] }; continue; }
    if (/^---\s*$/.test(line.text)) { if (cur) groups.push(cur); cur = null; continue; }
    if (!cur) cur = { id: null, lines: [] };
    cur.lines.push(line);
  }
  if (cur) groups.push(cur);
  return groups.map(c => {
    // trim trailing blank lines out of the span so appends land after the last real line
    let n = c.lines.length; while (n > 0 && !c.lines[n - 1].text.trim()) n--;
    const kept = c.lines.slice(0, n);
    const first = kept[0]?.text.replace(/^\s*-\s*id:/, 'id:').trim() ?? '';
    const list = /^\s*-\s*id:/.test(kept[0]?.text ?? '');
    const rest = kept.slice(1); const nonEmpty = rest.filter(l => l.text.trim());
    const indent = nonEmpty.length ? Math.min(...nonEmpty.map(l => l.text.match(/^\s*/)![0].length)) : 0;
    const body = (c.id ? [first, ...rest.map(l => l.text.slice(indent))] : kept.map(l => l.text)).join('\n').trim();
    const start = kept[0]?.start ?? 0; const last = kept[kept.length - 1]; const end = last ? last.start + last.text.length : start;
    return { id: c.id, body, raw: md_slice(kept), start, end, list };
  }).filter(c => c.body);
}
const md_slice = (ls: { text: string; start: number }[]) => ls.map(l => l.text).join('\n');

export function outline(md: string): { level: 2 | 3; text: string; slug: string }[] {
  const out: { level: 2 | 3; text: string; slug: string }[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(##|###) (.+)$/);
    if (m) out.push({ level: m[1].length as 2 | 3, text: m[2].trim(), slug: headingSlug(m[2]) });
  }
  return out;
}

export function documentTree(g: GraphData): { roots: DocNode[]; main: DocNode | null; byFile: Map<string, DocNode> } {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const nodes = new Map<string, DocNode>();
  for (const m of g.modules) {
    const module = byId.get(m.id)!;
    nodes.set(m.id, { module, file: m.file, slug: docSlug(m.file), title: m.title || module.title, children: [] });
  }
  const hasParent = new Set<string>();
  for (const e of g.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to) continue;
    const [parent, child] = e.verb === 'has' ? [e.from, e.to] : e.verb === 'part-of' ? [e.to, e.from] : [null, null];
    if (!parent || !child || hasParent.has(child)) continue;
    nodes.get(parent)!.children.push(nodes.get(child)!); hasParent.add(child);
  }
  // siblings follow their `order:` frontmatter (a number), then their title
  const orderOf = (d: DocNode) => { const m = d.module.body.match(/^order:\s*(-?\d+)/m); return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER; };
  const bySib = (a: DocNode, b: DocNode) => orderOf(a) - orderOf(b) || a.title.localeCompare(b.title);
  for (const d of nodes.values()) d.children.sort(bySib);
  const roots = [...nodes.values()].filter(d => !hasParent.has(d.module.id)).sort(bySib);
  const main = [...roots].sort((a, b) => b.children.length - a.children.length || a.title.localeCompare(b.title))[0] ?? null;
  const byFile = new Map([...nodes.values()].map(d => [d.file, d]));
  return { roots, main, byFile };
}

export function linkedDocuments(g: GraphData, idx: GraphIndex, file: string) {
  const { byFile } = documentTree(g);
  const counts = new Map<string, number>();
  for (const e of g.edges) {
    const a = idx.byId.get(e.from), b = idx.byId.get(e.to);
    if (!a || !b || !a.defined || !b.defined || !STRUCTURAL.has(e.verb)) continue; // mentions are too weak to count as a link
    if (a.kind === 'module' && b.kind === 'module' && (e.verb === 'has' || e.verb === 'part-of')) continue; // containment, shown in the tree instead
    const other = a.file === file && b.file !== file ? b.file : b.file === file && a.file !== file ? a.file : null;
    if (!other || !byFile.has(other)) continue;
    counts.set(other, (counts.get(other) ?? 0) + 1);
  }
  return [...counts].map(([f, count]) => ({ file: f, slug: byFile.get(f)!.slug, title: byFile.get(f)!.title, count })).sort((x, y) => y.count - x.count);
}

export function nodeIndex(g: GraphData): Record<string, IndexEntry> {
  const out: Record<string, IndexEntry> = {};
  const field = (body: string, key: string) => body.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim();
  for (const n of g.nodes) {
    if (n.kind === 'field') continue;
    const e: IndexEntry = { id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined, file: n.file };
    if (n.kind === 'goal' || n.kind === 'task') {
      const owner = field(n.body, 'owner'); const target = field(n.body, 'target') ?? field(n.body, 'due'); const progress = Number(field(n.body, 'progress'));
      if (owner) e.owner = owner; if (target) e.target = target; if (!Number.isNaN(progress) && field(n.body, 'progress')) e.progress = Math.max(0, Math.min(100, progress));
      const sess = field(n.body, 'session'); if (sess) e.sessions = sess.split(/[\s,]+/).filter(Boolean);
    }
    out[n.id] = e;
  }
  // Progress of a goal = share of the tasks, requirements and sub-goals that are part of it and done; a task's parent
  // goal is the goal it is part of.
  const parts = new Map<string, string[]>();
  for (const ed of g.edges) if (ed.verb === 'part-of' && out[ed.to]?.kind === 'goal' && out[ed.from] && ['task', 'req', 'goal'].includes(out[ed.from].kind)) {
    if (!parts.has(ed.to)) parts.set(ed.to, []); parts.get(ed.to)!.push(ed.from);
    if (out[ed.from].kind !== 'req') out[ed.from].parent = ed.to;
  }
  const isDone = (id: string) => { const e = out[id]; return DONE_STATUSES.has(e.status) || (e.progress ?? 0) >= 100; };
  for (const [goal, ids] of parts) { const done = ids.filter(isDone).length; out[goal].parts = { done, total: ids.length }; if (out[goal].progress === undefined && ids.length) out[goal].progress = Math.round(100 * done / ids.length); }
  return out;
}

// Where a graph file lives in the product layout: projects/<project>/docs/<doc>.md → { project, doc }.
export function docRoute(file: string): { project: string; doc: string } | null {
  const m = file.match(/\/projects\/([^/]+)\/docs\/([^/]+)\.md$/);
  return m ? { project: m[1], doc: m[2] } : null;
}
// The document tree of one project: only modules whose file is under that project's docs folder.
export function projectTree(g: GraphData, project: string) {
  const all = documentTree(g);
  const inProject = (d: DocNode) => docRoute(d.file)?.project === project;
  const roots = all.roots.filter(inProject);
  const main = roots.length ? [...roots].sort((a, b) => b.children.length - a.children.length || a.title.localeCompare(b.title))[0] : null;
  return { roots, main, byFile: all.byFile };
}
