'use client';
import { useState, type ReactNode, type RefObject } from 'react';
import { parseBody } from '@/lib/graph';
import { setBodyField } from '@/lib/yaml-form';
import { STATUSES } from '@/lib/props';
import { Linkified } from './IdLink';

// The cards a typed block renders as — a prose or yaml node, a question, a decision — shared by the document
// editor (the block's inline content in the text slot) and by an embed of the node on another page (a text area
// in the slot; decision:wf2.embed-renders-source-card). One set of components, so the two renderings cannot drift.

export type CardP = { kind: string; slug: string; status: string; form: string; body: string; textKey: string; extra: string; check: string; row: string };
export type CardHost = {
  text: (className: string) => ReactNode;      // the node's text: editor content or an embed's text area
  peek: () => void;                            // open the node in the context column
  copyLink: () => void;
  send: () => void;
  stop?: (el: HTMLElement | null) => void;     // the editor stops its own mouse/key handling at the header
  onHeadClick?: (e: React.MouseEvent) => void; // the editor selects the block when its header is clicked
  hostRef?: RefObject<HTMLDivElement | null>;
  slugReadOnly?: boolean;                      // an embed never renames the node (its line would dangle)
  extraClass?: string;
};

// A yaml flow list "[a, b]" renders as its items; anything else as linkified text.
export function PropValue({ value }: { value: string }) {
  const m = value.match(/^\[(.*)\]$/s);
  if (!m) return <Linkified text={value} />;
  const items = m[1].split(/,\s*(?![^()]*\))/).map(x => x.trim()).filter(Boolean);
  if (!items.length) return <span className="muted">none</span>;
  return <span className="list">{items.map((it, i) => <span key={i} className="item"><Linkified text={it} /></span>)}</span>;
}

const PropRows = ({ rows, stop }: { rows: { key: string; value: string }[]; stop?: CardHost['stop'] }) => (
  <dl className="nblock-props" contentEditable={false} ref={stop}>{rows.map(r => <div key={r.key}><dt>{r.key}</dt><dd>{r.value.includes('\n') ? <pre><Linkified text={r.value} /></pre> : <PropValue value={r.value} />}</dd></div>)}</dl>
);

// Which card a node renders as: question and decision yaml cards have their own; everything else is the plain block.
export function NodeCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  if (p.kind === 'question' && p.form === 'yaml') return <QuestionCard p={p} set={set} host={host} />;
  if (p.kind === 'decision' && p.form === 'yaml') return <DecisionCard p={p} set={set} host={host} />;
  return <ProseCard p={p} set={set} host={host} />;
}

// A typed block (requirement, entity, rule, task, …): header with kind, id and status; the text; a yaml card's
// other keys read-only under it, the yaml toggle to edit them.
export function ProseCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const [showYaml, setShowYaml] = useState(false);
  const rows = p.form === 'yaml' ? parseBody(p.body).filter(r => r.key !== p.textKey && r.key !== 'status') : [];
  return (
    <div className={`nblock k-${p.kind} ${p.check === 'done' || p.status === 'done' ? 'done' : ''} ${host.extraClass ?? ''}`} data-id={`${p.kind}:${p.slug}`} ref={host.hostRef}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        {(p.check || p.kind === 'task') && (
          <input type="checkbox" className="nblock-check" checked={p.check === 'done' || p.status === 'done'} onChange={e => set({ check: e.target.checked ? 'done' : 'todo', status: e.target.checked ? 'done' : 'open' })} title="done?" />
        )}
        <button type="button" className="pill k nblock-peek" style={{ background: `var(--k-${p.kind}, var(--k-other))` }} title="Open this node in the panel" onClick={host.peek}>{p.kind}</button>
        <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{(STATUSES.includes(p.status) ? [] : [p.status]).concat(STATUSES).map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
        {p.form === 'prose' && <input className={`nblock-extra ${p.extra ? '' : 'hover-only'}`} value={p.extra} placeholder="key: value" onChange={e => set({ extra: e.target.value })} />}
        <span className="nblock-tools hover-only">
          {p.form === 'yaml' && <button type="button" className="nblock-send" onClick={() => setShowYaml(v => !v)}>{showYaml ? 'hide yaml' : 'yaml'}</button>}
          <button type="button" className="nblock-send" title="Copy a link to this node" onClick={host.copyLink}>⧉</button>
          <button type="button" className="nblock-send" title="Send this node to an agent" onClick={host.send}>⇢</button>
        </span>
      </div>
      {host.text('nblock-text')}
      {rows.length > 0 && !showYaml && <PropRows rows={rows} stop={host.stop} />}
      {showYaml && p.form === 'yaml' && <textarea className="nblock-yaml" contentEditable={false} value={p.body} rows={Math.min(24, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />}
    </div>
  );
}

// A question card: the question and its answer are what matters; id, status and the other fields sit in "details".
export function QuestionCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const [details, setDetails] = useState(false);
  const rows = parseBody(p.body);
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const q = get('q'); const answer = get('answer') || get('a');
  const id = `${p.kind}:${p.slug}`;
  const others = rows.filter(r => !['id', 'title', 'q', 'answer', 'a', 'status', p.textKey].includes(r.key));
  const status = p.status || 'open';
  return (
    <div className={`nblock k-question qnode s-${status} ${host.extraClass ?? ''}`} data-id={id} ref={host.hostRef}>
      <div className="qnode-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="qnode-mark" title="Open this question in the panel" onClick={host.peek}>Q</button>
        <select className={`status-sel s-${status} ${status === 'open' ? 'hover-only' : ''}`} value={status} onChange={e => set({ status: e.target.value })} title="status">{['open', 'resolved', 'rejected'].map(st => <option key={st} value={st}>{st}</option>)}</select>
        <span className="qnode-acts hover-only">
          <button type="button" className="nblock-send" title="Copy a link to this question" onClick={host.copyLink}>⧉</button>
          <button type="button" className="nblock-send" title="Send this question to an agent" onClick={host.send}>⇢</button>
          <button type="button" className="nblock-send" onClick={() => setDetails(d => !d)} title="id, links and the rest">{details ? 'hide details' : 'details'}</button>
        </span>
      </div>
      {host.text('qnode-title nblock-text')}
      {p.textKey !== 'q' && <div className="qnode-section" contentEditable={false} ref={host.stop}>
        <label>question</label>
        <textarea className="qnode-ta" value={q} rows={Math.min(8, Math.max(2, Math.ceil(q.length / 90)))} placeholder="the question, and why it matters" onChange={e => set({ body: setBodyField(p.body, 'q', e.target.value) })} />
      </div>}
      <div className={`qnode-section ${answer ? '' : 'empty'}`} contentEditable={false} ref={host.stop}>
        <label>answer</label>
        <textarea className="qnode-ta" value={answer} rows={Math.min(8, Math.max(2, Math.ceil(answer.length / 90)))} placeholder={status === 'open' ? 'not answered yet — write the answer here, record it as a decision block, then set the status to resolved' : 'no answer recorded'} onChange={e => set({ body: setBodyField(p.body, 'answer', e.target.value) })} />
      </div>
      {details && (
        <div className="qnode-details" contentEditable={false} ref={host.stop}>
          <div className="nblock-head"><button type="button" className="pill k nblock-peek" style={{ background: 'var(--k-question)' }} onClick={host.peek}>question</button><input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} /></div>
          {others.length > 0 && <PropRows rows={others} />}
          <textarea className="nblock-yaml" value={p.body} rows={Math.min(20, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// A decision card: context, choice and alternatives are what matters (rule:card-essence); consequences, date, affects
// and every other key sit in "details" with the id and the yaml, like the question card.
const DECISION_ESSENCE = ['context', 'choice', 'alternatives'];
export function DecisionCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const [details, setDetails] = useState(false);
  const rows = parseBody(p.body);
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const id = `${p.kind}:${p.slug}`;
  const others = rows.filter(r => !['id', 'title', 'status', p.textKey, ...DECISION_ESSENCE].includes(r.key));
  return (
    <div className={`nblock k-decision dnode s-${p.status} ${host.extraClass ?? ''}`} data-id={id} ref={host.hostRef}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="pill k nblock-peek" style={{ background: 'var(--k-decision)' }} title="Open this decision in the panel" onClick={host.peek}>decision</button>
        <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
        <span className="nblock-tools hover-only">
          <button type="button" className="nblock-send" title="Copy a link to this decision" onClick={host.copyLink}>⧉</button>
          <button type="button" className="nblock-send" title="Send this decision to an agent" onClick={host.send}>⇢</button>
          <button type="button" className="nblock-send" onClick={() => setDetails(d => !d)} title="consequences, date, links and the rest">{details ? 'hide details' : 'details'}</button>
        </span>
      </div>
      {host.text('qnode-title nblock-text')}
      {DECISION_ESSENCE.filter(k => get(k)).map(k => (
        <div key={k} className="qnode-section" contentEditable={false} ref={host.stop}>
          <label>{k}</label>
          <textarea className="qnode-ta" value={get(k)} rows={Math.min(12, Math.max(2, Math.ceil(get(k).length / 90)))} onChange={e => set({ body: setBodyField(p.body, k, e.target.value) })} />
        </div>
      ))}
      {details && (
        <div className="qnode-details" contentEditable={false} ref={host.stop}>
          {others.length > 0 && <PropRows rows={others} />}
          <textarea className="nblock-yaml" value={p.body} rows={Math.min(20, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />
        </div>
      )}
    </div>
  );
}
