import { NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getProduct, listProducts } from '@/lib/products';
import { filesRoot, vaultLib } from '@/lib/workspace';
import { fileOp, inside, listDir, readFileAt, type FileOp } from '@/lib/files';

// op:api.workspace-files (req:wf2.workspace-files) — the files of the open folder. The root is the workspace's folder;
// in the home workspace, the code folder of ?product=<slug> (its `repo:`, or a vault's own folder).
// GET ?dir=<folder> → { root, path, entries: [{ name, dir, vault?, ignored? }], vault } — what git ignores and build
//   folders left out unless &hidden=1; `vault`: the slug of the product whose vault is the nearest at or above the
//   folder ('' when there is none), `own`: that vault is this folder's own.
// GET ?path=<file> → { root, path, language, text, size, mtime } — or { binary: true } / { large: true } with no text.
// POST { op, path, … } does what the Files menu asks (lib/files#fileOp): rename { name }, move / copy { into }, delete
//   (to the system's trash), mkdir / newfile { name }, reveal (the system's file browser), open (the file's own
//   application) → { path } of what came of it. A path that leaves the root is refused.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const product = sp.get('product') ? await getProduct(sp.get('product')!) : null;
  const root = await filesRoot(product);
  if (!root) return NextResponse.json({ error: 'not_found', message: 'no folder is open, and this product names no code folder' }, { status: 404 });
  const asDir = sp.has('dir'); const at = inside(root, (sp.get(asDir ? 'dir' : 'path') ?? '').trim());
  if (!at) return NextResponse.json({ error: 'invalid', message: 'the path leaves the open folder' }, { status: 422 });
  const st = await stat(at.abs).catch(() => null);
  if (!st) return NextResponse.json({ error: 'not_found', message: `${at.rel || '.'} is not in ${root}` }, { status: 404 });
  if (asDir || st.isDirectory()) {
    if (!st.isDirectory()) return NextResponse.json({ error: 'invalid', message: `${at.rel} is a file` }, { status: 422 });
    const lib = vaultLib(); const vf = lib.vaultOf(at.abs);
    const owner = vf ? (await listProducts()).find(p => p.vault?.folder === vf) : undefined;
    return NextResponse.json({ root, name: path.basename(root), path: at.rel, dir: true, entries: await listDir(at.abs, { hidden: sp.get('hidden') === '1' }), vault: owner?.slug ?? '', own: !!vf && vf === at.abs, vaultFolder: vf ?? '' }, { headers: { 'cache-control': 'no-store' } });
  }
  return NextResponse.json({ root, ...(await readFileAt(at.abs, at.rel)) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const sp = new URL(req.url).searchParams;
  const product = sp.get('product') ? await getProduct(sp.get('product')!) : null;
  const root = await filesRoot(product);
  if (!root) return NextResponse.json({ error: 'not_found', message: 'no folder is open' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Partial<FileOp>;
  if (!body.op || typeof body.path !== 'string') return NextResponse.json({ error: 'invalid', message: 'op and path are required' }, { status: 422 });
  try { return NextResponse.json({ ok: true, ...(await fileOp(root, body as FileOp)) }); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); const code = m.split(':')[0]; return NextResponse.json({ error: ['conflict', 'not_found', 'invalid'].includes(code) ? code : 'failed', message: m.replace(/^\w+: /, '') }, { status: code === 'conflict' ? 409 : code === 'not_found' ? 404 : code === 'invalid' ? 422 : 500 }); }
}
