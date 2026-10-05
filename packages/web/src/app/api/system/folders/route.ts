import { NextResponse } from 'next/server';
import { listFolders, makeFolder } from '@/lib/folders';

export const dynamic = 'force-dynamic';
// The folder picker's listing (components/FolderPicker): GET ?path=&hidden=1 → { path, parent, home, folders, product };
// POST { parent, name } makes a folder and answers with its listing. Local app, no gate: folder names only, no files.
export async function GET(req: Request) {
  const u = new URL(req.url);
  return NextResponse.json(await listFolders(u.searchParams.get('path') ?? '', { hidden: u.searchParams.get('hidden') === '1' }));
}
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { parent?: string; name?: string };
  try { return NextResponse.json(await listFolders(await makeFolder(body.parent ?? '', body.name ?? ''))); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return NextResponse.json({ error: 'invalid', message: (e as NodeJS.ErrnoException).code === 'EEXIST' ? 'a folder with that name is already there' : m.replace(/^\w+: /, '') }, { status: 422 }); }
}
