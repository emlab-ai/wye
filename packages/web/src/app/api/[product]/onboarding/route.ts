import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { readOnboarding, markStep, setDismissed } from '@/lib/onboarding-io';
import { STEPS, type StepKey } from '@/lib/onboarding';

// The Quick start (docs/superpowers/specs/2026-10-05-onboarding-design.md). GET → { steps: [{ key, group, title, why,
// shortcut?, done }], done, total, next, complete, dismissed, show, agents: { claude, codex } }. POST { mark?: StepKey,
// dismissed?: boolean } → the same body; the marks and the dismissal are this machine's (_settings.json), never the product's.
const KEYS = new Set<string>(STEPS.map(s => s.key));
const state = async (product: string) => {
  const o = await readOnboarding(product);
  return o ? NextResponse.json(o, { headers: { 'cache-control': 'no-store' } }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
};

export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  return state((await params).product);
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!(await getProduct(product))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { mark?: unknown; dismissed?: unknown };
  if (b.mark !== undefined && (typeof b.mark !== 'string' || !KEYS.has(b.mark))) return NextResponse.json({ error: 'invalid', message: `mark is one of ${[...KEYS].join(', ')}` }, { status: 422 });
  if (b.dismissed !== undefined && typeof b.dismissed !== 'boolean') return NextResponse.json({ error: 'invalid', message: 'dismissed is true or false' }, { status: 422 });
  if (typeof b.mark === 'string') await markStep(product, b.mark as StepKey);
  if (typeof b.dismissed === 'boolean') await setDismissed(product, b.dismissed);
  return state(product);
}
