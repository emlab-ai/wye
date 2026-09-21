import { NextResponse } from 'next/server';
import { loadScope, treeFor } from '@/lib/scope';
import { plan, write, type ImportFile } from '@/lib/import-docs';
import { rebuild } from '@/lib/write';

// op:api.import — POST multipart: every "file" part is a markdown file, its name the path inside the import (a
// folder drop keeps "notes/2026/plan.md"); fields `parent` (a document slug), `analyse` ("0" declines the agent).
// Writes the documents (lib:import-docs), rebuilds, returns what landed and what was skipped. The agent comes
// after, through hook:import-analyse on `module.created where status=imported` (req:wf2.import.markdown).
export async function POST(req: Request, { params }: { params: Promise<{ product: string; project: string }> }) {
  const { product, project } = await params;
  const scope = await loadScope(product, project); if (!scope || !scope.project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const form = await req.formData();
  const files: ImportFile[] = []; const images = new Map<string, Buffer>();
  for (const [key, v] of form.entries()) {
    if (!(v instanceof File)) continue;
    const rel = (key === 'file' ? v.name : key).replace(/\\/g, '/').replace(/^\.?\//, '');
    if (/\.(md|markdown)$/i.test(rel)) files.push({ path: rel, text: v.size > 1_000_001 ? 'x'.repeat(1_000_002) : await v.text() });
    else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(rel)) images.set(rel, Buffer.from(await v.arrayBuffer()));
    else files.push({ path: rel, text: '' });                       // named in the result as skipped
  }
  if (!files.length) return NextResponse.json({ error: 'invalid', message: 'no files' }, { status: 422 });
  const parent = String(form.get('parent') ?? '').trim() || undefined;
  const analyse = String(form.get('analyse') ?? '1') !== '0';
  const tree = treeFor(scope, project);
  const existing = new Set([...tree.byFile.values()].map(d => d.slug));
  if (parent && !existing.has(parent)) return NextResponse.json({ error: 'invalid', message: `no document ${parent}` }, { status: 422 });
  const p = plan(files, { project, parent, analyse, existing });
  const r = await write(scope.project.docsDir, p, async from => images.get(from) ?? null);
  const built = await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, docs: p.docs.map(d => ({ slug: d.slug, title: d.title, folder: d.folder, parent: d.parent, from: d.from })), skipped: p.skipped, assets: r.assets, analyse, rebuilt: built.code === 0 });
}
