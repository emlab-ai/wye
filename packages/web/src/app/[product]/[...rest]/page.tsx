import { GoneNotice } from '@/components/GoneNotice';

// Any address under a product that no page answers: the shell stays and the notice says so (never a bare 404).
export default async function RestPage({ params }: { params: Promise<{ product: string; rest: string[] }> }) {
  const { product, rest } = await params;
  return <GoneNotice what="route" slug={`/${product}/${rest.join('/')}`} product={product} />;
}
