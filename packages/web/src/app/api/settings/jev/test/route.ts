import { NextResponse } from 'next/server';
import { jevClient } from '@/lib/jev';

// POST → one tiny question to Jev with the stored key: { ok: true, ms, model } or { error }.
export async function POST() {
  const c = await jevClient(); if (!c.enabled) return NextResponse.json({ error: 'no key stored' }, { status: 422 });
  const t0 = Date.now();
  try { const r = await c.ask('Help! My payouts have been failing for 3 days.', { urgent: { type: 'noul', instructions: 'Does this convey urgency?' } }); return NextResponse.json({ ok: true, ms: Date.now() - t0, model: r.model, noul: r.answers?.urgent?.noul }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
