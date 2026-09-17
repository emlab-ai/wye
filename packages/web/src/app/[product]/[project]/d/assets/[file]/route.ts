import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getProduct, getProject } from '@/lib/products';

// Images and files a document embeds: docs/assets/<file>, served relative to the document's URL so the markdown
// can say ![caption](assets/<file>) and render both here and on GitHub.
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', mp4: 'video/mp4', txt: 'text/plain', md: 'text/markdown', json: 'application/json' };
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; project: string; file: string }> }) {
  const { product, project, file } = await params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file)) return new Response('bad name', { status: 400 });
  const p = await getProduct(product); const pr = p && await getProject(p, project); if (!pr) return new Response('not found', { status: 404 });
  try { const data = await readFile(path.join(pr.docsDir, 'assets', file)); return new Response(data, { headers: { 'content-type': TYPES[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'private, max-age=60' } }); } catch { return new Response('not found', { status: 404 }); }
}
