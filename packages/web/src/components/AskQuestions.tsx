'use client';
import { useState } from 'react';

// The agent's AskUserQuestion, rendered as a form instead of a permission dump. Answers go back inside the tool's
// input as `answers: { "<question>": "<label>" }` (multi-select comma-separated), the shape Claude Code reads.
export type Question = { question: string; header?: string; multiSelect?: boolean; kind?: 'text' | 'number'; min?: number; max?: number; step?: number; unit?: string; defaultValue?: number; options?: { label: string; description?: string }[] };
export type AskInput = { questions?: Question[]; answers?: Record<string, string> };

export function AskQuestions({ input, requestId, answer, done }: { input: AskInput; requestId: string; answer: (requestId: string, allow: boolean, input?: unknown) => void; done?: Record<string, string> | 'denied' }) {
  const qs = input.questions ?? [];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [free, setFree] = useState<Record<string, string>>(() => Object.fromEntries(qs.filter(q => q.kind === 'number' && q.defaultValue !== undefined).map(q => [q.question, String(q.defaultValue)])));
  const valueOf = (q: Question) => q.kind === 'text' || q.kind === 'number' ? (free[q.question] ?? '').trim() : [...(picked[q.question] ?? []), ...((other[q.question] ?? '').trim() ? [other[q.question].trim()] : [])].join(', ');
  const complete = qs.every(q => valueOf(q));
  const toggle = (q: Question, label: string) => setPicked(p => { const cur = p[q.question] ?? []; const next = q.multiSelect ? (cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label]) : [label]; return { ...p, [q.question]: next }; });
  const submit = () => answer(requestId, true, { ...input, answers: Object.fromEntries(qs.map(q => [q.question, valueOf(q)])) });
  if (done) return (
    <div className="ask">
      {qs.map(q => <div key={q.question} className="ask-q answered">{q.header && <span className="ask-header">{q.header}</span>}<p className="ask-text">{q.question}</p><p className="ask-answer">{done === 'denied' ? <span className="muted">skipped — the agent went on without an answer</span> : done[q.question] ? <><span className="muted">you answered </span><b>{done[q.question]}</b></> : <span className="muted">allowed without an answer — the agent went on with its own assumption</span>}</p></div>)}
    </div>
  );
  return (
    <div className="ask">
      <p className="ask-lead">The agent is asking — it waits for your answer.</p>
      {qs.map(q => (
        <div key={q.question} className="ask-q">
          {q.header && <span className="ask-header">{q.header}</span>}
          <p className="ask-text">{q.question}</p>
          {q.kind === 'text' && <textarea className="ask-free" rows={3} value={free[q.question] ?? ''} placeholder="your answer" onChange={e => setFree(f => ({ ...f, [q.question]: e.target.value }))} />}
          {q.kind === 'number' && <p className="ask-num"><input type="number" min={q.min} max={q.max} step={q.step} value={free[q.question] ?? ''} onChange={e => setFree(f => ({ ...f, [q.question]: e.target.value }))} />{q.unit && <span className="muted"> {q.unit}</span>}</p>}
          {!q.kind && (
            <ul className="ask-options" role={q.multiSelect ? 'group' : 'radiogroup'}>
              {(q.options ?? []).map(o => {
                const on = (picked[q.question] ?? []).includes(o.label);
                return <li key={o.label}><button type="button" role={q.multiSelect ? 'checkbox' : 'radio'} aria-checked={on} className={`ask-opt ${on ? 'on' : ''}`} onClick={() => toggle(q, o.label)}><i>{on ? '●' : '○'}</i><span><b>{o.label}</b>{o.description && <small>{o.description}</small>}</span></button></li>;
              })}
              <li><label className="ask-other"><i>{(other[q.question] ?? '').trim() ? '●' : '○'}</i><input value={other[q.question] ?? ''} placeholder="Other — type your own answer" onChange={e => setOther(x => ({ ...x, [q.question]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && complete) submit(); }} /></label></li>
            </ul>
          )}
        </div>
      ))}
      <div className="sec-actions ask-actions">
        <button className="pri" disabled={!complete} onClick={submit}>Answer</button>
        <button onClick={() => answer(requestId, false)} title="The agent continues without an answer">Skip</button>
        {!complete && <span className="muted">answer every question to send</span>}
      </div>
    </div>
  );
}
