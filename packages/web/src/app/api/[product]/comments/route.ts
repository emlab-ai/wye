import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { addComment, commentsOn, removeComment } from '@/lib/comments';

// Comments (req:ontology.comment-home, decision:ontology.comment-is-a-ref). GET ?on=<id> → the comments on a node,
// oldest first. POST { on, text, by?, session?, project? } → a `comment:` row in the Comments document of the node's
// project (one per project, created on its first comment) with `on:` the node; answers with the comment and where it went.
// DELETE ?id=<comment id> → the row leaves the Comments document.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const on = new URL(req.url).searchParams.get('on') ?? '';
  if (!on) return NextResponse.json({ error: 'invalid', message: 'on=<id> required' }, { status: 422 });
  return NextResponse.json({ on, comments: commentsOn(scope.graph, on) });
}

export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { on?: string; text?: string; by?: string; session?: string; project?: string };
  if (!body.on) return NextResponse.json({ error: 'invalid', message: 'on (the node id) required' }, { status: 422 });
  const r = await addComment(scope, { on: body.on, text: body.text ?? '', by: body.by, session: body.session, project: body.project });
  if (!r.ok) return NextResponse.json({ error: r.status === 404 ? 'not_found' : 'invalid', message: r.message }, { status: r.status });
  return NextResponse.json(r);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'invalid', message: 'id required' }, { status: 422 });
  const r = await removeComment(scope, id);
  if (!r.ok) return NextResponse.json({ error: r.status === 404 ? 'not_found' : 'invalid', message: r.message }, { status: r.status });
  return NextResponse.json(r);
}
