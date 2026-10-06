import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getProduct, metaFileOf } from '@/lib/products';
import { patchFrontmatter, writeAtomic, withFileLock } from '@/lib/write';

// PATCH { title?, icon?, description? } → { ok, title, icon, description }: rename a product — the keys of its
// _product.md. The slug (its folder, its address) stays: every link to the product keeps working.
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { title?: unknown; icon?: unknown; description?: unknown };
  const patch: Record<string, string> = {};
  for (const k of ['title', 'icon', 'description'] as const) if (typeof b[k] === 'string') patch[k] = b[k].replace(/\s+/g, ' ').trim();
  if (patch.title === '') return NextResponse.json({ error: 'invalid', message: 'a product needs a title' }, { status: 422 });
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'invalid', message: 'nothing to change: title, icon or description' }, { status: 422 });
  const file = metaFileOf(p); // a vault's own file, else the registry entry's
  return withFileLock(file, async () => {
    const md = await readFile(file, 'utf8').catch(() => '');
    const r = md.startsWith('---\n') ? patchFrontmatter(md, patch) : { md: `---\n${Object.entries(patch).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${md}` };
    if ('error' in r && r.error) return NextResponse.json({ error: r.error, message: '_product.md has no readable front matter' }, { status: 422 });
    await writeAtomic(file, r.md);
    return NextResponse.json({ ok: true, title: patch.title ?? p.meta.title, icon: patch.icon ?? p.meta.icon, description: patch.description ?? p.meta.description });
  });
}
