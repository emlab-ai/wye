import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getProduct } from '@/lib/products';
import { setFrontmatter, getFrontmatter } from '@/lib/pr-doc';
import { parsePins, formatPins, togglePin } from '@/lib/pins';
import { writeAtomic, withFileLock } from '@/lib/write';

// PATCH { doc: 'project/slug', pinned: boolean } → { pinned: [...] } (decision:wf2.pinned-documents): the product's
// `pinned:` list in _product.md, the document added at the end or taken out.
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { doc?: string; pinned?: boolean };
  if (!b.doc || !/^[A-Za-z0-9_.-]+\/~?[A-Za-z0-9_.-]+$/.test(b.doc)) return NextResponse.json({ error: 'invalid', message: 'doc is project/slug' }, { status: 422 });
  const file = path.join(p.dir, '_product.md');
  const list = await withFileLock(file, async () => {
    const md = await readFile(file, 'utf8');
    const next = togglePin(parsePins(getFrontmatter(md, 'pinned') ?? undefined), b.doc!, b.pinned !== false);
    const out = next.length ? setFrontmatter(md, 'pinned', formatPins(next)) : md.replace(/^pinned:.*\n/m, '');
    if (out !== md) await writeAtomic(file, out);
    return next;
  });
  return NextResponse.json({ pinned: list });
}
