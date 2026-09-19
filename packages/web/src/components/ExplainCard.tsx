'use client';
import { useState } from 'react';
import { usePeek } from './PeekProvider';
import { TranscriptMarkdown } from './TranscriptMarkdown';

// "What do we know about this?" on a node (req:exec.explain-anywhere): one librarian turn — the current state around
// the node with the nodes as tags — shown in the column; nothing proposed, nothing written.
export function ExplainCard({ id }: { id: string }) {
  const { product } = usePeek();
  const [state, setState] = useState<{ busy: boolean; text?: string; error?: string } | null>(null);
  const run = async () => {
    setState({ busy: true });
    const r = await fetch(`/api/${product}/explain`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    const j = await r.json().catch(() => ({}));
    setState(r.ok ? { busy: false, text: j.explanation } : { busy: false, error: j.message ?? j.error ?? 'could not explain' });
  };
  return (
    <section className="explain">
      <div className="peek-bar peek-sub"><strong>Explain</strong><span className="muted">what the product knows around this</span><button className="linkish produced-toggle" onClick={run} disabled={state?.busy}>{state?.busy ? 'asking Wye…' : state?.text ? 'again' : 'ask Wye'}</button></div>
      {state?.error && <p className="bad small">{state.error}</p>}
      {state?.text && <div className="explain-text"><TranscriptMarkdown>{state.text}</TranscriptMarkdown></div>}
    </section>
  );
}
