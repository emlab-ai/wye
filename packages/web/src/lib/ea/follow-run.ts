// The follow scan, the IO part: every other product's graph read as it stands — from the build coordinator's memory or
// its graph.json (lib/build#graphFor), never built here, so a product without a graph is skipped rather than written
// (constraint:ea.reads-other-products-only). Nothing in this file writes.
import { listProducts } from '../products';
import { graphFor } from '../build';
import { followScan, type FollowItem } from './follow';

export async function scanProducts(self: string, names: string[], opts: { products?: string[] } = {}): Promise<{ items: FollowItem[]; skipped: string[] }> {
  const items: FollowItem[] = []; const skipped: string[] = [];
  if (!names.length) return { items, skipped };
  for (const p of await listProducts()) {
    if (p.slug === self || (opts.products && !opts.products.includes(p.slug))) continue;
    const g = await graphFor(p.dir);
    if (!g) { skipped.push(p.slug); continue; }
    items.push(...followScan(p.slug, g.graph, g.idx, names));
  }
  return { items, skipped };
}
