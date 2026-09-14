import { NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { indexGraph, relations } from '@/lib/graph';
import { loadGraph } from '@/lib/load';
import { documentTree } from '@/lib/doc';

export async function GET(_req: Request, { params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id: raw } = await params; const id = decodeURIComponent(raw);
  const p = getProject(project); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const node = idx.byId.get(id); if (!node) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { byFile } = documentTree(g); const d = node.file ? byFile.get(node.file) : undefined;
  return NextResponse.json({ node, relations: relations(idx, id), doc: d ? { slug: d.slug, title: d.title } : null });
}
