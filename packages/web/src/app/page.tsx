import { redirect } from 'next/navigation';
import { listProducts } from '@/lib/products';

export default async function Home() {
  const products = await listProducts();
  if (!products.length) return <main style={{ padding: 32 }}><h1>No products yet</h1><p>Create <code>data/products/&lt;slug&gt;/_product.md</code> or use the API.</p></main>;
  redirect(`/${products[0].slug}`);
}
