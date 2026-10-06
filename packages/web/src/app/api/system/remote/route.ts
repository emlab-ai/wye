import { NextResponse } from 'next/server';
import { appPort, connectRemote, disconnectRemote, listRemotes } from '@/lib/remote';

// op:api.system.remote (decision:wf2.remote-tunnel): the SSH reverse tunnels this app keeps to servers where agents run.
// GET → { remotes: [{ host, port, on, state: off | connecting | connected | failed, message, since }], port } — port is
// the one this app answers on. POST { action: connect, host, port? } opens (and remembers) one — port is the port on the
// server, this app's own by default; { action: disconnect, host } closes it and keeps the host; { action: remove, host }
// forgets it. → the same view. Refused for a request that did not name this machine (the app answers on 127.0.0.1 only; a
// request that came through a tunnel also says localhost, so this is a guard against a mis-set proxy, not a login).
const here = (req: Request) => { const h = new URL(req.url).hostname; return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; };
const portOf = (req: Request) => Number(new URL(req.url).port) || appPort();

export async function GET(req: Request) { return NextResponse.json({ remotes: await listRemotes(), port: portOf(req) }, { headers: { 'cache-control': 'no-store' } }); }
export async function POST(req: Request) {
  if (!here(req)) return NextResponse.json({ error: 'forbidden', message: 'tunnels are opened from the machine the app runs on' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; host?: string; port?: number };
  if (body.action === 'connect') {
    const r = await connectRemote(body.host, body.port, portOf(req));
    return 'error' in r ? NextResponse.json({ error: 'invalid', message: r.error }, { status: 422 }) : NextResponse.json({ remotes: r, port: portOf(req) });
  }
  if (body.action === 'disconnect' || body.action === 'remove') return NextResponse.json({ remotes: await disconnectRemote(body.host, body.action === 'remove'), port: portOf(req) });
  return NextResponse.json({ error: 'invalid', message: 'action: connect | disconnect | remove' }, { status: 422 });
}
