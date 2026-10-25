import { NextResponse } from 'next/server';
import { appPort, connectRemote, connectWorkspace, disconnectRemote, disconnectWorkspace, listRemotes } from '@/lib/remote';

// op:api.system.remote (decision:wf2.remote-tunnel): the SSH reverse tunnels this app keeps to servers where agents run.
// GET → { remotes: [{ host, port, on, state: off | connecting | connected | failed, message, since }], port } — port is
// the one this app answers on. POST { action: connect, host, port? } opens (and remembers) one — port is the port on the
// server, this app's own by default; { action: disconnect, host } closes it and keeps the host; { action: remove, host }
// forgets it. → the same view. Workspaces (plan:remote-workspaces) are rows with use: workspace — { action:
// workspace-connect, host | url, name?, port?, user?, password? } adds or changes one and connects it (a box: its Wye checked and
// started over ssh, then the forward tunnel; an address: nothing to open); { action: workspace-disconnect | workspace-remove,
// name }. Their rows carry name, local (the tunnel's port here), url, user, version and open (where to load it); a
// password goes to the credentials file (lib/credentials) and is never sent back.
// Refused for a request that did not name this machine (the app answers on 127.0.0.1 only; a
// request that came through a tunnel also says localhost, so this is a guard against a mis-set proxy, not a login).
const here = (req: Request) => { const h = new URL(req.url).hostname; return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; };
const portOf = (req: Request) => Number(new URL(req.url).port) || appPort();

export async function GET(req: Request) { return NextResponse.json({ remotes: await listRemotes(), port: portOf(req) }, { headers: { 'cache-control': 'no-store' } }); }
export async function POST(req: Request) {
  if (!here(req)) return NextResponse.json({ error: 'forbidden', message: 'tunnels are opened from the machine the app runs on' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; host?: string; port?: number; url?: string; name?: string; user?: string; password?: string };
  if (body.action === 'workspace-connect') {
    const r = await connectWorkspace(body);
    return 'error' in r ? NextResponse.json({ error: 'invalid', message: r.error }, { status: 422 }) : NextResponse.json({ remotes: r, port: portOf(req) });
  }
  if (body.action === 'workspace-disconnect' || body.action === 'workspace-remove') return NextResponse.json({ remotes: await disconnectWorkspace(body.name, body.action === 'workspace-remove'), port: portOf(req) });
  if (body.action === 'connect') {
    const r = await connectRemote(body.host, body.port, portOf(req));
    return 'error' in r ? NextResponse.json({ error: 'invalid', message: r.error }, { status: 422 }) : NextResponse.json({ remotes: r, port: portOf(req) });
  }
  if (body.action === 'disconnect' || body.action === 'remove') return NextResponse.json({ remotes: await disconnectRemote(body.host, body.action === 'remove'), port: portOf(req) });
  return NextResponse.json({ error: 'invalid', message: 'action: connect | disconnect | remove | workspace-connect | workspace-disconnect | workspace-remove' }, { status: 422 });
}
