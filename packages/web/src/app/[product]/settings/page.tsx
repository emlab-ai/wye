import Link from 'next/link';
import path from 'node:path';
import { getProduct, registryDir } from '@/lib/products';
import { SettingsFolder } from '@/components/SettingsFolder';
import { SettingsExport } from '@/components/SettingsExport';
import { DeleteProduct } from '@/components/DeleteProduct';

// One product's settings: where its folder is, exporting it, and deleting it. What belongs to the app on this machine rather than to
// this product — the theme, agents, the Jev key — is at /settings.
export default async function ProductSettingsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product);
  const relocated = !!p && path.resolve(p.dir) !== path.resolve(registryDir(product));
  return (
    <div className="page">
      <header className="doc-head">
        <h1 className="prop-in h1" style={{ margin: 0 }}>{p?.meta.title ?? product} settings</h1>
        <p className="sub">this product — the app&apos;s own are in <Link href={`/settings?from=${product}`}>App settings</Link></p>
      </header>
      <SettingsFolder product={product} />
      <SettingsExport product={product} />
      {p && <DeleteProduct product={product} title={p.meta.title || product} relocated={relocated} dir={p.dir} />}
    </div>
  );
}
