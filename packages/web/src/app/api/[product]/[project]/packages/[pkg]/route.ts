import { NextResponse } from 'next/server';
import { refusalReply, uninstallPackage } from '@/lib/install';

const refusal = (e: unknown) => { const r = refusalReply(e); return NextResponse.json(r.body, { status: r.status }); };

// op:install.uninstall: DELETE → the link, the record entry and the types this install declared are gone
export async function DELETE(_req: Request, { params }: { params: Promise<{ product: string; project: string; pkg: string }> }) {
  const { product, project, pkg } = await params;
  try { return NextResponse.json(await uninstallPackage(product, project, pkg)); }
  catch (e) { return refusal(e); }
}
