import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { assignTask } from '@/lib/work-io';

// op:api.work.assign — POST { id, worker, note?, plan?, cwd?, force?, agent?, build?: plan ref } → the task handed to a worker
// (req:exec.dispatch): a person gets `worker:`; an agent a conversation; `runner` a queued run session. 409 when a
// session already holds it (assign again with force), 422 when refused (done, or blocked by an open task).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { id?: string; worker?: string; note?: string; cwd?: string; force?: boolean; agent?: string; by?: string; build?: string };
  if (!body.id || !body.worker) return NextResponse.json({ error: 'invalid', message: 'id and worker required' }, { status: 422 });
  const r = await assignTask(scope, body.id, { worker: body.worker, note: body.note, cwd: body.cwd, force: body.force, agent: body.agent, by: body.by, build: body.build, wfUrl: new URL(req.url).origin });
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === 'not_found' ? 404 : r.error === 'held' ? 409 : 422 });
  return NextResponse.json(r);
}
