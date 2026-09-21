import { NextResponse } from 'next/server';
import { readSettings, writeSettings, publicSettings, agentSettings, type Settings } from '@/lib/settings';

// GET → { jev: { set, last4 }, agents: { parallel, agent } } (never the key). PUT { jev?: { key }, agents?: { parallel, agent } } → the same view; an empty key removes it.
export async function GET() { return NextResponse.json(publicSettings(await readSettings()), { headers: { 'cache-control': 'no-store' } }); }
export async function PUT(req: Request) {
  const body = (await req.json()) as { jev?: { key?: string }; agents?: { parallel?: number; agent?: string; hooks?: boolean } };
  if (body.jev && typeof body.jev.key !== 'string') return NextResponse.json({ error: 'invalid', message: 'jev.key must be a string' }, { status: 422 });
  const patch: Settings = {}; if (body.jev) patch.jev = { key: (body.jev.key ?? '').trim() }; if (body.agents) patch.agents = agentSettings({ agents: body.agents });
  return NextResponse.json(publicSettings(await writeSettings(patch)));
}
