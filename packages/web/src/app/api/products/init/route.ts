import { NextResponse } from 'next/server';
import { initVaultHere } from '@/lib/vault-init';

// op:api.product-init (req:wf2.vault-init) — POST { folder, slug?, title? } → Init Wye here: the folder gains its own
// vault in .wye/ (lib/vault.js, what `wye init` in that folder does), linked to the vault above and the ones below,
// and is opened as a product. A folder that already has one is opened as it is.
// → { slug, vault, dir, folder, existing, written, parent, children, linked }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { folder?: string; slug?: string; title?: string };
  try { return NextResponse.json({ ok: true, ...(await initVaultHere({ folder: body.folder ?? '', slug: body.slug, title: body.title })) }); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); const code = m.split(':')[0]; return NextResponse.json({ error: code === 'conflict' ? 'conflict' : 'invalid', message: m.replace(/^\w+: /, '') }, { status: code === 'conflict' ? 409 : 422 }); }
}
