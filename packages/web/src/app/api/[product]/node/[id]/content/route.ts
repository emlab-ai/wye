// A node's content (req:ontology.content, decision:wf2.content-editor-scoped): GET reads the blocks indented under
// its defining line as markdown of their own, with the child ids in order and the document's hash; PUT replaces
// them under that hash (rule:if-match), rebuilds the graph and runs the check (rule:validate-before-write).
import { NextResponse } from 'next/server';
import { claimWrite } from '@/lib/changes';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { REPO_ROOT } from '@/lib/products';
import { readContent, writeContent } from '@/lib/node-content';
import { nodeText, patchProseNode, patchYamlCard, textPatch } from '@/lib/node-edit';
import { bodyOf, hashOf, lint, rebuild, withFileLock, writeAtomic } from '@/lib/write';
import { recordArtifact } from '@/lib/artifacts';
import { docIdOf, docRoute } from '@/lib/doc';

async function locate(product: string, id: string) {
  const scope = await loadScope(product); if (!scope) return null;
  const node = scope.idx.byId.get(id); if (!node || !node.defined || !node.file) return null;
  return { scope, node, abs: path.join(REPO_ROOT, node.file) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const hit = await locate(product, id); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const md = await readFile(hit.abs, 'utf8');
  const content = readContent(md, id, hit.node.line, hit.node.form ?? 'yaml');
  if (content === null) return NextResponse.json({ error: 'invalid', message: `${id} has no content in its document (${hit.node.form ?? 'yaml'} form)` }, { status: 422 });
  // the child ids in document order: the node's own `has` edges, block nodes included
  const children = (hit.scope.idx.out.get(id) ?? []).filter(e => e.verb === 'has' && !e.generated).map(e => e.to);
  const route = docRoute(hit.node.file);
  // the node's text comes first: in the column it is the first block of the content editor (decision:wf2.text-is-first-block)
  return NextResponse.json({ id, file: hit.node.file, project: route?.project ?? '', doc: route?.doc ?? '', text: nodeText(hit.node.body), content, children, bodyHash: hashOf(bodyOf(md)) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const hit = await locate(product, id); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { content: string; text?: string; ifMatch?: string };
  claimWrite(id, { session: req.headers.get('x-wf-session') ?? undefined, by: req.headers.get('x-wf-by') ?? undefined }); // change records name the writer (lib/changes)
  if (typeof body.content !== 'string') return NextResponse.json({ error: 'invalid', message: 'content must be a string' }, { status: 422 });
  const session = req.headers.get('x-wf-session') ?? undefined;
  return withFileLock(hit.abs, async () => {
    const md = await readFile(hit.abs, 'utf8');
    const current = hashOf(bodyOf(md));
    if (body.ifMatch && body.ifMatch !== current) return NextResponse.json({ error: 'conflict', current }, { status: 409 });
    // the text first (the defining line or the card's text key), then the content under it — one write, one hash
    let cur = md;
    if (typeof body.text === 'string' && body.text.trim()) {
      const t = hit.node.form === 'prose' ? patchProseNode(cur, id, hit.node.line, { text: body.text }) : patchYamlCard(cur, id, textPatch(hit.node.body, body.text));
      if (t.error) return NextResponse.json({ error: t.error, message: `could not write the text of ${id}` }, { status: 422 });
      cur = t.md;
    }
    const next = writeContent(cur, id, hit.node.line, hit.node.form ?? 'yaml', body.content);
    if (next === null) return NextResponse.json({ error: 'invalid', message: `${id} has no content in its document` }, { status: 422 });
    if (next !== md) await writeAtomic(hit.abs, next);
    const built = await rebuild(hit.scope.product.dir);
    const checked = await lint(hit.scope.product.dir);
    const errors = checked.output.split('\n').filter(l => /^ERROR/i.test(l)).slice(0, 20);
  // the check is product-wide: an error is this document's when it names the file or a node defined in it; the rest is a count
  const own = new Set(hit.scope.graph.nodes.filter(n => n.defined && n.file === hit.node.file).map(n => n.id));
  const mine = errors.filter(e => e.includes(hit.node.file) || [...own].some(id => e.includes(id)));
    if (session) recordArtifact(hit.scope.product.dir, session, { node: id, blocks: [{ id, change: 'changed', doc: docIdOf(hit.scope.graph, hit.node.file) ?? '', title: hit.node.title ?? id, at: new Date().toISOString() }] }).catch(() => {});
    return NextResponse.json({ ok: true, rebuilt: built.code === 0, lintOk: mine.length === 0, lintErrors: mine, lintElsewhere: errors.length - mine.length, bodyHash: hashOf(bodyOf(next)) });
  });
}
