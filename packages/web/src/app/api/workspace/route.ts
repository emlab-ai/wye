import { NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { resolveRoot } from '@/lib/products';
import { openProduct } from '@/lib/product-transfer';
import { fixWorkspaceLinks, forgetWorkspace, openWorkspace, rescanWorkspace, workspaceView, type LinkFix } from '@/lib/workspace';

// op:api.workspace (req:wf2.workspace-open) — the folder the app has open and the vaults it reaches.
// GET → { folder, name, recent, vaults: [{ slug, title, icon, folder, parent }] } (folder null: the home workspace).
// POST { folder } opens a folder ('' goes back to the home workspace) → the same view; with `auto: true` a folder that
//   is itself a product kept the old way (projects/ in it, or in its wye/) is opened as a product instead → { slug };
// POST { forget: folder } takes a folder out of the opened workspaces (Home when it was the open one);
// POST { rescan: true } walks the open folder once → { vaults, fixes } — the links that differ from what it found,
// written by nobody; POST { fix: fixes } writes the ones sent back → { changed }.
export async function GET() { return NextResponse.json(await workspaceView(), { headers: { 'cache-control': 'no-store' } }); }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { folder?: string; auto?: boolean; rescan?: boolean; fix?: LinkFix[]; forget?: string };
  const isDir = async (p: string) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };
  try {
    if (typeof body.forget === 'string') { await forgetWorkspace(body.forget); return NextResponse.json({ ok: true, ...(await workspaceView()) }); }
    if (body.rescan) return NextResponse.json({ ok: true, ...(await rescanWorkspace()) });
    if (body.fix) return NextResponse.json({ ok: true, changed: await fixWorkspaceLinks(body.fix) });
    if (typeof body.folder !== 'string') return NextResponse.json({ error: 'invalid', message: 'folder, rescan or fix is required' }, { status: 422 });
    if (body.auto && body.folder.trim()) { const f = resolveRoot(body.folder.trim()); if (await isDir(path.join(f, 'projects')) || (!(await isDir(path.join(f, '.wye', 'projects'))) && await isDir(path.join(f, 'wye', 'projects')))) { const r = await openProduct(f); return NextResponse.json({ ok: true, slug: r.slug }); } }
    await openWorkspace(body.folder);
    return NextResponse.json({ ok: true, ...(await workspaceView()) });
  } catch (e) { const m = e instanceof Error ? e.message : String(e); return NextResponse.json({ error: 'invalid', message: m.replace(/^\w+: /, '') }, { status: 422 }); }
}
