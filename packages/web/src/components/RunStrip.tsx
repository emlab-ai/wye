'use client';
import { LIVE_RUN, RunRow, useRuns } from './RunPanel';

// The run strip on the document a workflow was started from (spec §5), in the shape of the PR head: the workflow, the
// stage, what is still missing and the person's Advance. Nothing is rendered when no run is live on the document — a
// document that was never run through a workflow looks exactly as it did.
export function RunStrip({ product, node }: { product: string; node: string }) {
  const { runs, reload } = useRuns(product, node);
  const live = runs.filter(r => LIVE_RUN.has(r.status));
  if (!live.length) return null;
  return (
    <section className="pr-head run-strip">
      {live.map(r => <RunRow key={r.id} product={product} run={r} reload={reload} />)}
    </section>
  );
}
