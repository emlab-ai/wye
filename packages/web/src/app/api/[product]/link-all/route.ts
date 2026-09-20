import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { REPO_ROOT } from '@/lib/products';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { linkAll, countPlain } from '@/lib/link-all';
import { docRoute } from '@/lib/doc';

// op:api.link-all (req:wf2.editor.entity-from-text): GET ?text= → where the phrase is still a plain word, per
// document; POST { text, id, docs? } → every plain occurrence becomes a link to the node, in the documents named
// (default all), written atomically per file, the graph rebuilt once. Never inside frontmatter, code, comments,
// links, ids or the key side of a card (lib/link-all).
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const text = (new URL(req.url).searchParams.get('text') ?? '').trim();
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim(); // the node the phrase will link to: its own line does not count
  if (!text) return NextResponse.json({ error: 'invalid', message: 'text required' }, { status: 422 });
  const docs: { doc: string; project: string; title: string; count: number }[] = [];
  for (const m of scope.graph.modules) {
    let md = ''; try { md = await readFile(path.join(REPO_ROOT, m.file), 'utf8'); } catch { continue; }
    const n = countPlain(md, text, id || undefined); const r = docRoute(m.file);
    if (n && r) docs.push({ doc: r.doc, project: r.project, title: m.title, count: n });
  }
  return NextResponse.json({ text, docs, count: docs.reduce((a, d) => a + d.count, 0) });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { text?: string; id?: string; docs?: string[] };
  const text = (body.text ?? '').trim(); const id = (body.id ?? '').trim();
  if (!text || !/^[a-z-]+:[\w.\-/#]+$/.test(id)) return NextResponse.json({ error: 'invalid', message: 'text and a node id required' }, { status: 422 });
  const only = body.docs ? new Set(body.docs) : null;
  const done: { doc: string; count: number }[] = [];
  for (const m of scope.graph.modules) {
    const r = docRoute(m.file); if (!r) continue;
    if (only && !only.has(`${r.project}/${r.doc}`)) continue;
    const abs = path.join(REPO_ROOT, m.file);
    await withFileLock(abs, async () => {
      let md = ''; try { md = await readFile(abs, 'utf8'); } catch { return; }
      const out = linkAll(md, text, id);
      if (out.count) { await writeAtomic(abs, out.md); done.push({ doc: `${r.project}/${r.doc}`, count: out.count }); }
    });
  }
  if (done.length) await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, id, text, docs: done, count: done.reduce((a, d) => a + d.count, 0) });
}
