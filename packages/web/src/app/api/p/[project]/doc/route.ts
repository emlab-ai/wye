import { NextResponse } from 'next/server';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getProject } from '@/lib/projects';
import { loadGraph } from '@/lib/load';
import { documentTree } from '@/lib/doc';
import { instantiate, slugify, TEMPLATES } from '@/lib/templates';
import { rebuild, writeAtomic } from '@/lib/write';

// Create a document from a template: POST { title, template, parent }  → { slug }
export async function POST(req: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { title?: string; template?: string; parent?: string };
  const title = (body.title ?? '').trim();
  const template = (body.template ?? 'blank') as typeof TEMPLATES[number];
  if (!title) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  if (!TEMPLATES.includes(template)) return NextResponse.json({ error: 'invalid', message: 'unknown template' }, { status: 422 });
  const g = await loadGraph(p.graphPath);
  const tree = documentTree(g);
  const parentDoc = body.parent ? [...tree.byFile.values()].find(x => x.slug === body.parent) : tree.main;
  const parent = parentDoc ? parentDoc.module.id.replace(/^module:/, '') : 'root';
  const slug = slugify(title);
  const graphDir = path.dirname(tree.main?.file ?? 'docs/context-graph/x.md');
  const file = path.join(graphDir, `${slug}.md`);
  const abs = path.join(p.rootPath, file);
  try { await access(abs); return NextResponse.json({ error: 'conflict', message: `${file} exists` }, { status: 409 }); } catch { /* does not exist: good */ }
  const tpl = await readFile(path.resolve(process.cwd(), '../../templates/docs', `${template}.md`), 'utf8');
  const md = instantiate(tpl, { title, slug, parent, date: new Date().toISOString().slice(0, 10) });
  await writeAtomic(abs, md);
  const built = await rebuild(p.rootPath);
  return NextResponse.json({ ok: true, slug, file, rebuilt: built.code === 0 });
}
