import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { relations, neighborhood } from '@/lib/graph';
import { typeOf, nodeProps, instancesOf } from '@/lib/types';
import { editNode, type NodePatch } from '@/lib/node-edit';
import { recordArtifact } from '@/lib/artifacts';
import { docIdOf } from '@/lib/doc';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/products';
import { readContent, removeNode } from '@/lib/node-content';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { claimWrite, removalRecord, saveChange } from '@/lib/changes';

export async function GET(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = scope.idx.byId.get(id); if (!node) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const depth = Math.min(3, Math.max(1, Number(new URL(req.url).searchParams.get('depth') ?? 1) || 1));
  // the node's neighbourhood for the graph view: every node within `depth` hops and the edges among them
  const ids = neighborhood(scope.idx, id, depth, false);
  const nodes = [...ids].map(i => scope.idx.byId.get(i)).filter(Boolean).map(n => ({ id: n!.id, kind: n!.kind, title: n!.title, status: n!.status, defined: n!.defined }));
  const edges = scope.graph.edges.filter(e => !e.generated && ids.has(e.from) && ids.has(e.to));
  const type = typeOf(scope.graph, id);
  // a type: node also carries its own definition and every instance (the kind and its subtypes)
  const self = id.startsWith('type:') ? (scope.graph.types ?? []).find(t => t.id === id) ?? null : null;
  const instances = self ? instancesOf(scope.graph, self.slug).map(n => ({ id: n.id, title: n.title, status: n.status })) : undefined;
  // the node's content (req:ontology.content) as markdown of its own, for the card's preview; null when it has no form for it
  let content: string | null = null;
  if (node.defined && node.file && node.form !== 'block') { try { content = readContent(await readFile(path.join(REPO_ROOT, node.file), 'utf8'), id, node.line, node.form ?? 'yaml'); } catch { content = null; } }
  return NextResponse.json({ node, relations: relations(scope.idx, id), graph: { nodes, edges }, type: type ?? null, props: type ? nodeProps(scope.graph, node) : [], inverses: scope.graph.inverses ?? {}, self, instances, content });
}

// PUT { status?, text?, props?: { key: value | null } } → edits the prose line that defines the node in place, then
// rebuilds the product graph. A session (header x-wf-session, set by the wf CLI from WF_SESSION) is recorded on
// tasks it completes and gets the node in its artifacts.
export async function PUT(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const patch = (await req.json()) as NodePatch;
  const session = req.headers.get('x-wf-session') ?? undefined;
  claimWrite(id, { session, by: req.headers.get('x-wf-by') ?? (patch.props?.by as string | undefined) ?? undefined }); // the change record names the writer (lib/changes)
  if (session && id.startsWith('task:') && patch.status === 'done') patch.props = { ...(patch.props ?? {}), session: addToken((scope.idx.byId.get(id)?.body.match(/^session:\s*(.+)$/m)?.[1] ?? ''), session) };
  const r = await editNode(scope, id, patch);
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === 'not_found' ? 404 : 422 });
  // approving a node that names what it supersedes retires the old ones in the same act (decision:memory.bitemporal)
  if (patch.status === 'approved') for (const e of scope.idx.out.get(id) ?? []) if (e.verb === 'supersedes' && scope.idx.byId.get(e.to)?.defined) await editNode(scope, e.to, { status: 'superseded' }).catch(() => undefined);
  if (session) { const n = scope.idx.byId.get(id); recordArtifact(scope.product.dir, session, { node: id, blocks: [{ id, change: 'changed', doc: n ? docIdOf(scope.graph, n.file) ?? '' : '', title: n?.title ?? id, at: new Date().toISOString() }] }).catch(() => {}); }
  return NextResponse.json({ ok: true, line: r.line, file: r.file });
}
const addToken = (cur: string, t: string) => [...new Set([...cur.split(/\s+/).filter(Boolean), t])].join(' ');

// DELETE → the node out of its document, with its content (the column's Delete, the person's act). A change record
// (removalRecord) keeps the node as it was and the exact text taken out, so nothing deleted is lost.
export async function DELETE(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = scope.idx.byId.get(id);
  if (!node?.defined || !node.file) return NextResponse.json({ error: 'not_found', message: `${id} is not defined in a document` }, { status: 404 });
  if (scope.graph.modules.some(m => m.id === id)) return NextResponse.json({ error: 'invalid', message: `${id} is a page — delete the page instead` }, { status: 422 });
  const file = path.join(REPO_ROOT, node.file);
  claimWrite(id, { session: req.headers.get('x-wf-session') ?? undefined, by: req.headers.get('x-wf-by') ?? 'person' });
  const removed = await withFileLock(file, async () => {
    const md = await readFile(file, 'utf8'); const next = removeNode(md, id, node.line, node.form ?? 'yaml');
    if (next === null || next === md) return null;
    await writeAtomic(file, next); return takenOut(md, next);
  });
  if (removed === null) return NextResponse.json({ error: 'invalid', message: `${id} could not be taken out of ${node.file}` }, { status: 422 });
  const at = new Date().toISOString();
  // the record says where the text sat, so a revert puts it back there (req:exec.reject-undo)
  const record = removalRecord(node, removed.text, req.headers.get('x-wf-by') ?? 'person', product, at, docIdOf(scope.graph, node.file) ?? '', removed.at);
  await saveChange(scope.product.dir, record);
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, id, file: node.file, change: record.id });
}
// the lines that were taken out: what lies between the lines both versions start with and the lines they end with
function takenOut(before: string, after: string): { text: string; at: number } {
  const x = before.split('\n'), y = after.split('\n');
  let a = 0; while (a < y.length && x[a] === y[a]) a++;
  let b = 0; while (b < y.length - a && x[x.length - 1 - b] === y[y.length - 1 - b]) b++;
  return { text: x.slice(a, x.length - b).join('\n').trim(), at: a };
}
