import { NextResponse } from 'next/server';
import { listInstalled, productDirFor, restoreLinks, syncPackageTypes } from '@/lib/install';

// op:install.list: GET → what each project of the product has installed, read from the records; a missing link of a
// recorded package is restored on the way (op:install.restore-links)
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const dir = await productDirFor(product); if (!dir) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const restored = await restoreLinks(dir);
  const typesAdded = await syncPackageTypes(dir);   // types a package gained after it was installed
  return NextResponse.json({ projects: await listInstalled(product), restored, typesAdded });
}
