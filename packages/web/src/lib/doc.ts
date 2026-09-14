import type { GraphData, GraphIndex, GraphNode } from './graph';

export type Segment = { type: 'markdown'; text: string } | { type: 'yaml'; raw: string; chunks: { id: string | null; body: string }[] };
export interface SplitDoc { frontmatter: Record<string, string>; segments: Segment[] }
export interface DocNode { module: GraphNode; file: string; slug: string; title: string; children: DocNode[] }
export type IndexEntry = { id: string; kind: string; title: string; status: string; defined: boolean; file: string };

export function docSlug(file: string): string { return file.split('/').pop()!.replace(/\.md$/, ''); }

export function headingSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function splitDocument(md: string): SplitDoc {
  const frontmatter: Record<string, string> = {};
  let body = md;
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = md.slice(fm[0].length);
    for (const line of fm[1].split('\n')) { const m = line.match(/^([\w-]+):\s*(.*)$/); if (m) frontmatter[m[1]] = m[2].trim(); }
  }
  const segments: Segment[] = [];
  const lines = body.split('\n');
  let buf: string[] = []; let inYaml = false; let inOther = false; let yamlBuf: string[] = [];
  const flushMd = () => { const text = buf.join('\n').trim(); if (text) segments.push({ type: 'markdown', text }); buf = []; };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inYaml) { inYaml = false; segments.push({ type: 'yaml', raw: yamlBuf.join('\n'), chunks: chunkYaml(yamlBuf) }); yamlBuf = []; continue; }
      if (inOther) { inOther = false; buf.push(line); continue; }
      if (/^```ya?ml/.test(line)) { flushMd(); inYaml = true; continue; }
      inOther = true; buf.push(line); continue;
    }
    if (inYaml) yamlBuf.push(line); else buf.push(line);
  }
  if (inYaml) segments.push({ type: 'yaml', raw: yamlBuf.join('\n'), chunks: chunkYaml(yamlBuf) });
  flushMd();
  return { frontmatter, segments };
}

function chunkYaml(lines: string[]): { id: string | null; body: string }[] {
  const chunks: { id: string | null; lines: string[] }[] = [];
  let cur: { id: string | null; lines: string[] } | null = null;
  for (const raw of lines) {
    const idm = raw.match(/^\s*-?\s*id:\s*([a-z-]+:[A-Za-z0-9_./#\-]+)/);
    if (idm) { if (cur) chunks.push(cur); cur = { id: idm[1], lines: [raw] }; continue; }
    if (/^---\s*$/.test(raw)) { if (cur) chunks.push(cur); cur = null; continue; }
    if (!cur) cur = { id: null, lines: [] };
    cur.lines.push(raw);
  }
  if (cur) chunks.push(cur);
  return chunks.map(c => {
    const first = c.lines[0]?.replace(/^\s*-\s*id:/, 'id:').trim() ?? '';
    const rest = c.lines.slice(1); const nonEmpty = rest.filter(l => l.trim());
    const indent = nonEmpty.length ? Math.min(...nonEmpty.map(l => l.match(/^\s*/)![0].length)) : 0;
    const body = (c.id ? [first, ...rest.map(l => l.slice(indent))] : c.lines).join('\n').trim();
    return { id: c.id, body };
  }).filter(c => c.body);
}

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
    if (e.verb !== 'has' || !nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to) continue;
    nodes.get(e.from)!.children.push(nodes.get(e.to)!); hasParent.add(e.to);
  }
  const roots = [...nodes.values()].filter(d => !hasParent.has(d.module.id));
  const main = [...roots].sort((a, b) => b.children.length - a.children.length || a.title.localeCompare(b.title))[0] ?? null;
  const byFile = new Map([...nodes.values()].map(d => [d.file, d]));
  return { roots, main, byFile };
}

export function linkedDocuments(g: GraphData, idx: GraphIndex, file: string) {
  const { byFile } = documentTree(g);
  const counts = new Map<string, number>();
  for (const e of g.edges) {
    const a = idx.byId.get(e.from), b = idx.byId.get(e.to);
    if (!a || !b || !a.defined || !b.defined) continue;
    if (a.kind === 'module' && b.kind === 'module') continue; // containment, shown in the tree instead
    const other = a.file === file && b.file !== file ? b.file : b.file === file && a.file !== file ? a.file : null;
    if (!other || !byFile.has(other)) continue;
    counts.set(other, (counts.get(other) ?? 0) + 1);
  }
  return [...counts].map(([f, count]) => ({ file: f, slug: byFile.get(f)!.slug, title: byFile.get(f)!.title, count })).sort((x, y) => y.count - x.count);
}

export function nodeIndex(g: GraphData): Record<string, IndexEntry> {
  const out: Record<string, IndexEntry> = {};
  for (const n of g.nodes) { if (n.kind === 'field') continue; out[n.id] = { id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined, file: n.file }; }
  return out;
}
