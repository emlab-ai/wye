import { loadScope } from '@/lib/scope';
import { readOnboarding } from '@/lib/onboarding-io';
import { quickStartLinks } from '@/lib/quick-start-links';
import { QuickStart } from '@/components/QuickStart';

// The Quick start (docs/superpowers/specs/2026-10-05-onboarding-design.md §2): an app route on every product, not a
// document — nothing is written to the product, and it cannot collide with a person's page.
export default async function QuickStartPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return null; // the layout shows the notice
  const o = await readOnboarding(product); if (!o) return null;
  return <QuickStart product={scope.product.slug} initial={o} links={quickStartLinks(scope)} />;
}
