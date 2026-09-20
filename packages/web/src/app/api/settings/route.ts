import { NextResponse } from 'next/server';
import { readSettings, writeSettings, publicSettings } from '@/lib/settings';

// GET → { jev: { set, last4 } } (never the key). PUT { jev: { key } } → the same view; an empty key removes it.
export async function GET() { return NextResponse.json(publicSettings(await readSettings()), { headers: { 'cache-control': 'no-store' } }); }
export async function PUT(req: Request) {
  const body = (await req.json()) as { jev?: { key?: string } };
  if (body.jev && typeof body.jev.key !== 'string') return NextResponse.json({ error: 'invalid', message: 'jev.key must be a string' }, { status: 422 });
  return NextResponse.json(publicSettings(await writeSettings({ jev: { key: (body.jev?.key ?? '').trim() } })));
}
