import { NextResponse } from 'next/server';
import { loadScope, treeFor } from '@/lib/scope';
import { plan, write, type ImportFile } from '@/lib/import-docs';
import { startBatchImport } from '@/lib/import-run';
import { rebuild } from '@/lib/write';

// op:api.import — two shapes. Multipart: every "file" part is a markdown file, its name the path inside the import (a
// folder drop keeps "notes/2026/plan.md"); fields `parent` (a document slug), `analyse` ("0" declines the agent).
// Writes the documents (lib:import-docs), rebuilds, returns what landed and what was skipped. The agent comes
// after, through hook:import-analyse on `module.created where status=imported` (req:wf2.import.markdown). JSON
// `{ path, parent?, analyse?, brief? }`: a folder already on this machine (the desktop app owns the file system —
// no browser upload for a vault of hundreds of files) — lib:import-run reads it, makes a request page listing every
// file as a task, and imports them one at a time so at most one agent session runs from this import at once
// (req:wf2.import.markdown-path).
export async function POST(req: Request, { params }: { params: Promise<{ product: string; project: string }> }) {
  const { product, project } = await params;
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { path?: string; parent?: string; analyse?: boolean; brief?: string };
    const rootPath = (body.path ?? '').trim();
    if (!rootPath) return NextResponse.json({ error: 'invalid', message: 'path required' }, { status: 422 });
    const r = await startBatchImport(product, project, { rootPath, parent: body.parent, brief: body.brief, analyse: body.analyse !== false });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === 'not_found' ? 404 : 422 });
    return NextResponse.json(r);
  }
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
  const brief = String(form.get('brief') ?? '').trim() || undefined;   // what the person wants done with these pages — `brief:` on each, read by skill:import
  // more than one file is a folder or a pick of many: it runs as a background import (lib:import-run) — the pages are
  // written now, one task in Work stands for the import, and the agent takes the files one at a time; the dialog
  // only says it started. One file (a pasted page) is written here and opened at once.
  if (files.length > 1) {
    const tops = new Set(files.map(f => f.path.includes('/') ? f.path.split('/')[0] : ''));
    const label = tops.size === 1 && !tops.has('') ? [...tops][0] : `${files.length} files`;
    const r = await startBatchImport(product, project, { files, images, label, parent, brief, analyse });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === 'not_found' ? 404 : 422 });
    return NextResponse.json(r);
  }
  const tree = treeFor(scope, project);
  const existing = new Set([...tree.byFile.values()].map(d => d.slug));
  if (parent && !existing.has(parent)) return NextResponse.json({ error: 'invalid', message: `no document ${parent}` }, { status: 422 });
  const p = plan(files, { project, parent, analyse, brief, existing });
  const r = await write(scope.project.docsDir, p, async from => images.get(from) ?? null);
  const built = await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, docs: p.docs.map(d => ({ slug: d.slug, title: d.title, folder: d.folder, parent: d.parent, from: d.from })), skipped: p.skipped, assets: r.assets, analyse, rebuilt: built.code === 0 });
}
