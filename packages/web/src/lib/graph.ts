export interface GraphNode { id: string; kind: string; title: string; status: string; section: string; subsection: string; body: string; defined: boolean; file: string; line: number; owner?: string; form?: 'prose' | 'yaml' }
export interface GraphEdge { from: string; to: string; verb: string }
export interface GraphModule { id: string; title: string; file: string; verified: string; sourceRoots: string[] }
export interface GraphData { generatedAt: string; modules: GraphModule[]; files: string[]; nodes: GraphNode[]; edges: GraphEdge[]; fieldIndex: Record<string, string> }
export interface GraphIndex { byId: Map<string, GraphNode>; out: Map<string, GraphEdge[]>; inc: Map<string, GraphEdge[]> }
export interface BodyRow { key: string; value: string; prose: boolean }
export interface ModuleGroup { module: GraphNode; file: string; sections: { title: string; nodes: GraphNode[] }[] }

export const STRUCTURAL = new Set(['refines', 'satisfied-by', 'verified-by', 'governed-by', 'gated-by', 'has', 'refs', 'owns', 'calls', 'has-action', 'reads', 'writes', 'navigates', 'triggers', 'set-by', 'embedded-in', 'typed-as', 'contradicts', 'owned-by', 'applies-to', 'governs', 'edge-to', 'resolves', 'depends-on', 'adds', 'changes', 'part-of', 'related-to', 'produced']);
export const PROSE_KEYS = new Set(['purpose', 'note', 'notes', 'statement', 'description', 'context', 'consequences', 'intent', 'q', 'text']);

export function indexGraph(g: GraphData): GraphIndex {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const out = new Map<string, GraphEdge[]>(), inc = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    if (!out.has(e.from)) out.set(e.from, []); out.get(e.from)!.push(e);
    if (!inc.has(e.to)) inc.set(e.to, []); inc.get(e.to)!.push(e);
  }
  return { byId, out, inc };
}

export function sidebarTree(g: GraphData): ModuleGroup[] {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  return g.modules.map(m => {
    const module = byId.get(m.id)!;
    const sections = new Map<string, GraphNode[]>();
    const own = g.nodes.filter(n => n.file === m.file && n.defined && n.kind !== 'field' && n.id !== m.id).sort((a, b) => a.line - b.line);
    for (const n of own) {
      const title = n.section || 'Other';
      if (!sections.has(title)) sections.set(title, []);
      sections.get(title)!.push(n);
    }
    return { module, file: m.file, sections: [...sections].map(([title, nodes]) => ({ title, nodes })) };
  });
}

export function neighborhood(idx: GraphIndex, id: string, depth: number, structuralOnly: boolean): Set<string> {
  const seen = new Set([id]); let frontier = [id];
  const ok = (e: GraphEdge) => !structuralOnly || STRUCTURAL.has(e.verb);
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const e of idx.out.get(f) ?? []) if (ok(e) && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
      for (const e of idx.inc.get(f) ?? []) if (ok(e) && !seen.has(e.from)) { seen.add(e.from); next.push(e.from); }
    }
    frontier = next;
  }
  return seen;
}

export function parseBody(body: string): BodyRow[] {
  const rows: BodyRow[] = [];
  let cur: BodyRow | null = null; let block = false;
  for (const line of body.split('\n')) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 ()|_-]*?):(?:\s+(.*))?$/);
    if (m && !/^\s/.test(line)) {
      if (cur) rows.push(cur);
      const key = m[1].trim(); const raw = (m[2] ?? '').trim();
      block = raw === '>' || raw === '|';
      cur = { key, value: block ? '' : raw, prose: block || PROSE_KEYS.has(key.toLowerCase()) };
      continue;
    }
    if (!cur) continue;
    const text = block ? line.trim() : line.replace(/^ {2}/, '');
    cur.value = cur.value ? cur.value + (block ? ' ' : '\n') + text : text;
  }
  if (cur) rows.push(cur);
  return rows.filter(r => r.key !== 'id');
}

export function relations(idx: GraphIndex, id: string): { out: [string, string[]][]; inc: [string, string[]][] } {
  const group = (edges: GraphEdge[], pick: (e: GraphEdge) => string): [string, string[]][] => {
    const g = new Map<string, string[]>();
    for (const e of edges) { if (!g.has(e.verb)) g.set(e.verb, []); g.get(e.verb)!.push(pick(e)); }
    return [...g];
  };
  return { out: group(idx.out.get(id) ?? [], e => e.to), inc: group(idx.inc.get(id) ?? [], e => e.from) };
}
