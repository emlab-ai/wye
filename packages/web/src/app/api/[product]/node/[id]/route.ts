import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { relations, neighborhood } from '@/lib/graph';
import { typeOf, nodeProps, instancesOf } from '@/lib/types';
import { editNode, type NodePatch } from '@/lib/node-edit';
import { recordArtifact } from '@/lib/artifacts';

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
  return NextResponse.json({ node, relations: relations(scope.idx, id), graph: { nodes, edges }, type: type ?? null, props: type ? nodeProps(scope.graph, node) : [], inverses: scope.graph.inverses ?? {}, self, instances });
}

// PUT { status?, text?, props?: { key: value | null } } → edits the prose line that defines the node in place, then
// rebuilds the product graph. A session (header x-wf-session, set by the wf CLI from WF_SESSION) is recorded on
// tasks it completes and gets the node in its artifacts.
export async function PUT(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const patch = (await req.json()) as NodePatch;
  const session = req.headers.get('x-wf-session') ?? undefined;
  if (session && id.startsWith('task:') && patch.status === 'done') patch.props = { ...(patch.props ?? {}), session: addToken((scope.idx.byId.get(id)?.body.match(/^session:\s*(.+)$/m)?.[1] ?? ''), session) };
  const r = await editNode(scope, id, patch);
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === 'not_found' ? 404 : 422 });
  if (session) recordArtifact(scope.product.dir, session, { node: id }).catch(() => {});
  return NextResponse.json({ ok: true, line: r.line, file: r.file });
}
const addToken = (cur: string, t: string) => [...new Set([...cur.split(/\s+/).filter(Boolean), t])].join(' ');
