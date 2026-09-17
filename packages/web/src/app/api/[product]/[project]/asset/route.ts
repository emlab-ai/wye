import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { getProduct, getProject } from '@/lib/products';

// Upload a file into the project's docs/assets folder (pasted or dropped images): multipart "file" → { url }
// where url is relative to the document (assets/<name>), the form the markdown keeps.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; project: string }> }) {
  const { product, project } = await params;
  const p = await getProduct(product); const pr = p && await getProject(p, project); if (!pr) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const form = await req.formData(); const f = form.get('file');
  if (!(f instanceof File)) return NextResponse.json({ error: 'invalid', message: 'file required' }, { status: 422 });
  if (f.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'invalid', message: 'file over 20 MB' }, { status: 422 });
  const ext = (f.name.split('.').pop() || (f.type.split('/')[1] ?? 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const base = (f.name.replace(/\.[^.]+$/, '') || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  const name = `${new Date().toISOString().slice(0, 10)}-${base}-${randomBytes(3).toString('hex')}.${ext}`;
  const dir = path.join(pr.docsDir, 'assets'); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await f.arrayBuffer()));
  return NextResponse.json({ url: `assets/${name}`, name, size: f.size, type: f.type });
}
