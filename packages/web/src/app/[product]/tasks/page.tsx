import { redirect } from 'next/navigation';

// The Tasks entry became Work (req:exec.work-view): the old address still lands there.
export default async function Page({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  redirect(`/${product}/work`);
}
