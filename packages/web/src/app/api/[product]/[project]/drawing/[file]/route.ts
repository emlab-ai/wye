import { NextResponse } from 'next/server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getProduct, getProject } from '@/lib/products';
import { writeAtomic } from '@/lib/write';

// A drawing is an Excalidraw scene stored as docs/drawings/<slug>.excalidraw with an SVG export beside it.
// GET → the scene JSON (?fmt=svg → the SVG, ?fmt=png → the flattened PNG, ?fmt=md → the annotation description);
// PUT { json, svg, png?, description? } → writes them. The PNG and the description are what an agent reads (rule:image-annotations).
const SLUG = /^[a-z0-9][a-z0-9._-]*$/;

async function locate(product: string, project: string, file: string) {
  const slug = file.replace(/\.excalidraw$/, '');
  if (!SLUG.test(slug)) return null;
  const p = await getProduct(product); if (!p) return null;
  const pr = await getProject(p, project); if (!pr) return null;
  const dir = path.join(pr.docsDir, 'drawings');
  return { slug, dir, json: path.join(dir, `${slug}.excalidraw`), svg: path.join(dir, `${slug}.svg`), png: path.join(dir, `${slug}.png`), md: path.join(dir, `${slug}.md`) };
}

export async function GET(req: Request, { params }: { params: Promise<{ product: string; project: string; file: string }> }) {
  const { product, project, file } = await params;
  const hit = await locate(product, project, file); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const fmt = new URL(req.url).searchParams.get('fmt');
  try {
    if (fmt === 'svg') return new NextResponse(await readFile(hit.svg, 'utf8'), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
    if (fmt === 'png') return new NextResponse(await readFile(hit.png), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
    if (fmt === 'md') return new NextResponse(await readFile(hit.md, 'utf8'), { headers: { 'content-type': 'text/markdown', 'cache-control': 'no-store' } });
    return new NextResponse(await readFile(hit.json, 'utf8'), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }); }
}

export async function PUT(req: Request, { params }: { params: Promise<{ product: string; project: string; file: string }> }) {
  const { product, project, file } = await params;
  const hit = await locate(product, project, file); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { json?: string; svg?: string; png?: string; description?: string };
  if (typeof body.json !== 'string' || typeof body.svg !== 'string') return NextResponse.json({ error: 'invalid', message: 'json and svg required' }, { status: 422 });
  try { JSON.parse(body.json); } catch { return NextResponse.json({ error: 'invalid', message: 'json is not valid JSON' }, { status: 422 }); }
  await mkdir(hit.dir, { recursive: true });
  await writeAtomic(hit.json, body.json);
  await writeAtomic(hit.svg, body.svg);
  if (typeof body.png === 'string' && body.png) await writeFile(hit.png, Buffer.from(body.png.replace(/^data:image\/png;base64,/, ''), 'base64'));
  if (typeof body.description === 'string') await writeAtomic(hit.md, body.description.trim() ? body.description.trim() + '\n' : '');
  return NextResponse.json({ ok: true, file: path.relative(process.cwd(), hit.json) });
}
