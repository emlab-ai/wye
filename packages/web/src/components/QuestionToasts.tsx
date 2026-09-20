'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { agentLabel } from './SessionView';

type Asking = { id: string; agent: string; instruction: string; asking?: { requestId?: string; kind: 'question' | 'permission'; text: string } };

// A toast for every live conversation waiting on the person — an agent's question or a permission request nobody
// answered (req:wf2.sessions.question-toast): shown wherever the person is, refreshed on session changes, a click
// opens the conversation in the column with the question card; × hides that question until a new one comes.
export function QuestionToasts() {
  const { product, open } = usePeek();
  const [asking, setAsking] = useState<Asking[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/${product}/sessions`).then(r => r.ok ? r.json() : { sessions: [] }).then(j => { if (live) setAsking((j.sessions as Asking[]).filter(s => s.asking)); }).catch(() => {});
    load();
    const onChange = (e: Event) => { const d = (e as CustomEvent<{ kinds: string[] }>).detail; if (d.kinds.includes('session')) load(); };
    window.addEventListener('wf:change', onChange);
    const t = setInterval(load, 20000); // a permission request is a transcript event, not always a session file change
    return () => { live = false; window.removeEventListener('wf:change', onChange); clearInterval(t); };
  }, [product]);
  const shown = asking.filter(s => !hidden.has(`${s.id}:${s.asking!.requestId}`));
  if (!shown.length) return null;
  return (
    <div className="qtoasts" aria-live="polite">
      {shown.map(s => (
        <div key={s.id} className={`qtoast ${s.asking!.kind}`} role="button" onClick={() => open(`session:${s.id}`)} title="open the conversation">
          <div className="qtoast-head"><span className="qtoast-dot" />{agentLabel(s.agent)} {s.asking!.kind === 'question' ? 'asks' : 'needs permission'}<button className="qtoast-x" onClick={e => { e.stopPropagation(); setHidden(h => new Set(h).add(`${s.id}:${s.asking!.requestId}`)); }} title="hide">×</button></div>
          <div className="qtoast-q">{s.asking!.text.slice(0, 160)}</div>
          <div className="qtoast-sub muted">{s.instruction.split('\n').find(l => l.trim())?.slice(0, 70)}</div>
        </div>))}
    </div>
  );
}
