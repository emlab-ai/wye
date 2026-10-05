import { redirect } from 'next/navigation';
import { listProducts } from '@/lib/products';
import { Welcome } from '@/components/Welcome';

export default async function Home() {
  const products = await listProducts();
  if (!products.length) return <Welcome />;
  redirect(`/${products[0].slug}`);
}
