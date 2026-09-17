import { getProduct } from '@/lib/products';
import { agentSystemPrompt } from '@/lib/agent-prompt';

// The system prompt for agents working on this product (runners fetch it; the app applies it itself).
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return new Response('not found', { status: 404 });
  return new Response(await agentSystemPrompt(product, p.dir, new URL(req.url).origin), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } });
}
