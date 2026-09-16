import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { relations, neighborhood } from '@/lib/graph';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/products';
import { patchNodeLine } from '@/lib/node-line';
import { rebuild, writeAtomic, withFileLock } from '@/lib/write';

export async function GET(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = scope.idx.byId.get(id); if (!node) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const depth = Math.min(3, Math.max(1, Number(new URL(req.url).searchParams.get('depth') ?? 1) || 1));
  // the node's neighbourhood for the graph view: every node within `depth` hops and the edges among them
  const ids = neighborhood(scope.idx, id, depth, false);
  const nodes = [...ids].map(i => scope.idx.byId.get(i)).filter(Boolean).map(n => ({ id: n!.id, kind: n!.kind, title: n!.title, status: n!.status, defined: n!.defined }));
  const edges = scope.graph.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  return NextResponse.json({ node, relations: relations(scope.idx, id), graph: { nodes, edges } });
}

// PUT { status?, text?, props?: { key: value | null } } → edits the prose line that defines the node in place, then
// rebuilds the product graph. Yaml-form nodes are not editable this way (edit them in their document).
export async function PUT(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = scope.idx.byId.get(id); if (!node || !node.defined) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (node.form !== 'prose') return NextResponse.json({ error: 'invalid', message: 'only prose-form nodes can be edited here' }, { status: 422 });
  const patch = (await req.json()) as { status?: string; text?: string; props?: Record<string, string | null> };
  const abs = path.join(REPO_ROOT, node.file);
  return withFileLock(abs, async () => {
    const lines = (await readFile(abs, 'utf8')).split('\n');
    // the graph's line number is 1-based; guard against drift by checking the id is on that line, else search
    let i = node.line - 1;
    const defines = (l: string) => new RegExp('^(\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[[ xX]\\]\\s+)?|\\|\\s*)?' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)').test(l);
    if (!lines[i] || !defines(lines[i])) i = lines.findIndex(defines);
    if (i < 0) return NextResponse.json({ error: 'not_found', message: 'defining line not found' }, { status: 404 });
    const next = patchNodeLine(lines[i], patch);
    if (next === null) return NextResponse.json({ error: 'invalid', message: 'the defining line is not a prose node line' }, { status: 422 });
    if (next !== lines[i]) { lines[i] = next; await writeAtomic(abs, lines.join('\n')); await rebuild(scope.product.dir); }
    return NextResponse.json({ ok: true, line: next, file: node.file });
  });
}
