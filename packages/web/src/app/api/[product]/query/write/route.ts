import { NextResponse } from 'next/server';
import { writeQuery } from '@/lib/query-write';

// op:api.query-write (decision:wf2.query-from-words) — POST { ask, sql?, kind?, page?, me? } → { sql, rows }: a query
// an agent wrote from the words and the server ran once; 422 with why when it could not.
export const maxDuration = 120;
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = (await req.json().catch(() => ({}))) as { ask?: string; sql?: string; kind?: string; page?: string; me?: string[] };
  try {
    const r = await writeQuery(product, { ask: String(b.ask ?? ''), sql: b.sql, kind: b.kind, page: b.page, me: Array.isArray(b.me) ? b.me.map(String) : undefined }, req.signal);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'invalid', message: r.message, sql: r.sql }, { status: 422 });
  } catch (e) { return NextResponse.json({ error: 'agent', message: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
