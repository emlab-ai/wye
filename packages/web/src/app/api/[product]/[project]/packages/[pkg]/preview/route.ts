import { NextResponse } from 'next/server';
import { installPackage, refusalReply } from '@/lib/install';

const refusal = (e: unknown) => { const r = refusalReply(e); return NextResponse.json(r.body, { status: r.status }); };

// op:install.preview: GET → what an install would put in the project (skills, workflows, templates, each hook with its
// `on:` and whether it starts an agent session, each type new or already there); refuses as the install would
export async function GET(req: Request, { params }: { params: Promise<{ product: string; project: string; pkg: string }> }) {
  const { product, project, pkg } = await params;
  const createProduct = new URL(req.url).searchParams.get('createProduct') || undefined;
  try { return NextResponse.json(await installPackage(product, project, pkg, { dryRun: true, createProduct })); }
  catch (e) { return refusal(e); }
}
