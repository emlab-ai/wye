import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { slotState } from '@/lib/agent-host';

// The agent slots for the queue overview (rule:agent-slots): how many, how many taken, who waits and in what order.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!(await getProduct(product))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(await slotState(product));
}
