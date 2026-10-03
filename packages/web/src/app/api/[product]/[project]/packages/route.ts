import { NextResponse } from 'next/server';
import { installPackage, refusalReply } from '@/lib/install';

const refusal = (e: unknown) => { const r = refusalReply(e); return NextResponse.json(r.body, { status: r.status }); };

// op:install.install: POST { package, by?, dryRun?, createProduct? } — dryRun is the preview (nothing written);
// createProduct "<title>" makes the product, with this project, when it does not exist yet
export async function POST(req: Request, { params }: { params: Promise<{ product: string; project: string }> }) {
  const { product, project } = await params;
  const body = (await req.json()) as { package?: string; by?: string; dryRun?: boolean; createProduct?: string };
  if (!body.package) return NextResponse.json({ error: 'invalid', message: 'package required' }, { status: 422 });
  try { return NextResponse.json(await installPackage(product, project, body.package, { dryRun: !!body.dryRun, by: body.by, createProduct: body.createProduct?.trim() || undefined })); }
  catch (e) { return refusal(e); }
}
