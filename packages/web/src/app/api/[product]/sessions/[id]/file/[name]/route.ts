import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getProduct } from '@/lib/products';
import { filesDir } from '@/lib/sessions';

// A file attached to a session message (pasted image).
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string; name: string }> }) {
  const { product, id, name } = await params;
  if (!/^[a-z0-9-]+\.(png|jpg|gif|webp)$/.test(name) || !/^[a-z0-9]{6,32}$/.test(id)) return new Response('bad name', { status: 400 });
  const p = await getProduct(product); if (!p) return new Response('not found', { status: 404 });
  try { return new Response(await readFile(path.join(filesDir(p.dir, id), name)), { headers: { 'content-type': TYPES[name.split('.').pop()!], 'cache-control': 'private, max-age=3600' } }); } catch { return new Response('not found', { status: 404 }); }
}
