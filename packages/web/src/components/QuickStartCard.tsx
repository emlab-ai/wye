'use client';
import Link from 'next/link';
import type { QuickStartLinks } from '@/lib/quick-start-links';
import { StepAction, setDismissed, useOnboarding, type QuickStartState } from './QuickStart';

// The Overview's Quick start card (docs/superpowers/specs/2026-10-05-onboarding-design.md §2): while the product's
// Quick start is neither complete nor dismissed, how far it has got and the next step with its button — `bare`
// leaves the button to the Documents empty state below when the next step is the first document, so it is not there twice.
export function QuickStartCard({ product, initial, links, bare }: { product: string; initial: QuickStartState; links: QuickStartLinks; bare?: boolean }) {
  const [o, setO] = useOnboarding(product, initial);
  if (!o?.show) return null;
  const next = o.steps.find(s => s.key === o.next); if (!next) return null;
  return (
    <section className="qs-card" aria-label="Quick start">
      <div className="qs-card-head">
        <Link href={`/${product}/start`} className="qs-card-label">Quick start</Link>
        <span className="qs-card-count">{o.done} of {o.total}</span>
        <div className="qs-bar small" aria-hidden><i style={{ width: `${(o.done / o.total) * 100}%` }} /></div>
        <button type="button" className="qs-card-x" title="Hide the Quick start (Help brings it back)" aria-label="Hide the Quick start" onClick={async () => { const j = await setDismissed(product, true); if (j) setO(j); }}>×</button>
      </div>
      <p className="qs-card-next"><span className="muted">Next</span> <b>{next.title}</b>{next.shortcut && <kbd>{next.shortcut}</kbd>}</p>
      <p className="qs-card-why">{next.why}</p>
      <div className="sec-actions">{!(bare && next.key === 'document') && <StepAction step={next} product={product} links={links} primary />}<Link className="btn" href={`/${product}/start`}>All steps</Link></div>
    </section>
  );
}
