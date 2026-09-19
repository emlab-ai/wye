import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { packetFor } from '@/lib/packet';

// POST { text?, refs?: string[], budget?, all?, asOf? } → { markdown, seeds, hidden, counts: { kind: n }, questions: [ids] }
// The constraint packet (op:api.packet, decision:memory.constraint-packet): what governs a request — every rule,
// constraint, gate, approved decision, goal, lesson and open question within two hops of the seeds, complete;
// superseded, rejected and retired nodes left out unless `all` / `asOf`. `wf packet --for "<text>"` calls this.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { text?: string; refs?: string[]; budget?: number; all?: boolean; asOf?: string };
  const text = (body.text ?? '').toString(); const refs = Array.isArray(body.refs) ? body.refs.map(String) : [];
  if (!text.trim() && !refs.length) return NextResponse.json({ error: 'empty', message: 'text or refs required' }, { status: 400 });
  if (!scope.graph.nodes.length) return NextResponse.json({ markdown: '_The product has no graph yet._', seeds: [], hidden: 0, counts: {}, questions: [] });
  const { markdown, packet } = await packetFor(scope, text, refs, { budget: Math.min(60000, body.budget ?? 10000), all: !!body.all, asOf: body.asOf ?? null });
  return NextResponse.json({ markdown, seeds: packet.seeds, hidden: packet.hidden, counts: Object.fromEntries(Object.entries(packet.byKind).map(([k, l]) => [k, l.length])), questions: packet.questions.map(q => q.id) });
}
