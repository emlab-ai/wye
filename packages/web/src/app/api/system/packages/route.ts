import { NextResponse } from 'next/server';
import { listInstalled, listPackages } from '@/lib/install';

// op:install.library: GET → every package of the system library with what it holds; ?product=P adds the projects of P
// it is installed in (from the records)
export async function GET(req: Request) {
  const product = new URL(req.url).searchParams.get('product');
  const packages = await listPackages();
  const installed = product ? await listInstalled(product) : null;
  return NextResponse.json({ packages: packages.map(p => ({ slug: p.slug, title: p.title, description: p.description, ...p.contents, ...(installed ? { installedIn: installed.filter(i => i.packages.some(e => e.package === p.slug)).map(i => i.project) } : {}) })) });
}
