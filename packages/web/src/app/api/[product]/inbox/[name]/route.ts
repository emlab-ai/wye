import { NextResponse } from 'next/server';
import { captureTask } from '@/lib/work-io';
import { markFiled } from '@/lib/inbox';
import { loadScope } from '@/lib/scope';
import { dismissItem, fileItem, listInboxItems, suggestFiling } from '@/lib/inbox';
import { documentTree, docRoute } from '@/lib/doc';

// GET → the item with a filing suggestion. POST { action: 'file', doc, project, id } | { action: 'dismiss' }.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; name: string }> }) {
  const { product, name } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const item = (await listInboxItems(scope.product.dir)).find(i => i.name === decodeURIComponent(name)); if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const suggestion = await suggestFiling(scope.product.dir, scope.graph, product, item);
  const docs = [...documentTree(scope.graph).byFile.values()].map(d => ({ file: d.file, slug: d.slug, title: d.title, project: docRoute(d.file)?.project ?? '' })).filter(d => d.project);
  return NextResponse.json({ item, suggestion, docs });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string; name: string }> }) {
  const { product, name } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const item = (await listInboxItems(scope.product.dir)).find(i => i.name === decodeURIComponent(name)); if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json()) as { action?: string; doc?: string; project?: string; id?: string };
  if (b.action === 'dismiss') { await dismissItem(scope.product.dir, item.name); return NextResponse.json({ ok: true }); }
  if (b.action === 'file') {
    const d = [...documentTree(scope.graph).byFile.values()].find(x => x.slug === b.doc && docRoute(x.file)?.project === b.project); if (!d) return NextResponse.json({ error: 'not_found', message: 'document not found' }, { status: 404 });
    if (!b.id || !/^[a-z-]+:[A-Za-z0-9_.\-]+$/.test(b.id)) return NextResponse.json({ error: 'invalid', message: 'a node id like decision:offline.x is required' }, { status: 422 });
    if (scope.idx.byId.get(b.id)?.defined) return NextResponse.json({ error: 'conflict', message: `${b.id} already exists` }, { status: 409 });
    return NextResponse.json({ ok: true, ...(await fileItem(scope.product.dir, product, item, { file: d.file, id: b.id })) });
  }
  // a note filed as work (req:exec.capture): a task line on the backlog, the note marked filed to it
  if (b.action === 'task') {
    const text = [item.title, item.body].filter(Boolean).join(' — ').slice(0, 300);
    const r = await captureTask(scope, { text, partOf: item.refs[0], by: item.from, project: b.project });
    if (!r.ok) return NextResponse.json({ error: 'invalid', message: r.message }, { status: 422 });
    await markFiled(scope.product.dir, item.name, { file: r.file, node: r.id });
    return NextResponse.json({ ok: true, id: r.id, file: r.file });
  }
  return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
}
