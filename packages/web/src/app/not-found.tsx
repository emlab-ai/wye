import { listProducts } from '@/lib/products';
import { GoneNotice } from '@/components/GoneNotice';

// The app never shows the framework's bare 404 (decision:wf2.deleted-outside-stays-put): an address that matches
// nothing outside a product lands on the products that exist.
export default async function NotFound() {
  const products = await listProducts();
  return <GoneNotice what="route" slug="" products={products.map(p => ({ slug: p.slug, title: p.meta.title, icon: p.meta.icon }))} />;
}
