import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/query';

// op:api.query (decision:wf2.graph-query) — POST { sql } → { columns, rows, truncated, graph, ms }: one read query over
// the product's graph (tables nodes and edges; with DuckPGQ, graph wye for MATCH patterns). 422 with the engine's
// message when the query is not read-only or does not parse.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = (await req.json().catch(() => ({}))) as { sql?: string };
  const r = await runQuery(product, String(b.sql ?? ''));
  return r.ok ? NextResponse.json(r.result) : NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
}
