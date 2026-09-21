'use client';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { parseBody } from '@/lib/graph';
import { sameProse, setBodyField } from '@/lib/yaml-form';
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
  onSelect?: () => void;                       // a click anywhere on the card selects its node (rule:block-select)
  hostRef?: RefObject<HTMLDivElement | null>;
  slugReadOnly?: boolean;                      // an embed never renames the node (its line would dangle)
  extraClass?: string;
  // the node's content stays out of the card (req:wf2.ui.card-preview): the header carries the count as a chip
  // that opens the details; `folded` is false only while the editor's caret is inside the blocks
  fold?: { count: number; folded: boolean; open: () => void };
  // a question's answer is its content (decision:wf2.answer-is-content): how many blocks it has; in the editor
  // `start` inserts the first one and puts the caret there (the blocks render under the card); elsewhere `open`
  // shows the node's details, where the content editor is
  answer?: { count: number; start?: () => void; open: () => void };
};

// The chip in a card's header: how many blocks the node has under it; a click opens the node's details, where the
// content is (rule:card-fold).
function FoldToggle({ host }: { host: CardHost }) {
  const f = host.fold; if (!f || !f.count) return null;
  return <button type="button" className={`nblock-fold ${f.folded ? 'folded' : ''}`} title="Open the node: its content is in the details" onClick={e => { e.stopPropagation(); f.open(); }}>{f.folded ? '▸' : '▾'} {f.count} block{f.count === 1 ? '' : 's'}</button>;
}

// A yaml flow list "[a, b]" renders as its items; anything else as linkified text.
export function PropValue({ value }: { value: string }) {
  const m = value.match(/^\[(.*)\]$/s);
  if (!m) return <Linkified text={value} />;
  const items = m[1].split(/,\s*(?![^()]*\))/).map(x => x.trim()).filter(Boolean);
  if (!items.length) return <span className="muted">none</span>;
  return <span className="list">{items.map((it, i) => <span key={i} className="item"><Linkified text={it} /></span>)}</span>;
}

// The card's click handler: any part of the card selects the node — except a tag or link inside it, which
// navigates on its own.
function selectOn(host: CardHost) {
  if (!host.onSelect) return undefined;
  return (e: React.MouseEvent) => { if ((e.target as Element).closest('a')) return; host.onSelect!(); };
}

// A prose key's text area. Its text is local while typed: the stored value comes back trimmed and folded
// (sameProse), so taking it over the input on every render would drop the space the person just typed; a change
// from elsewhere (another editor, an agent) still replaces the text when it differs beyond folding.
function ProseArea({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(t => sameProse(t, value) ? t : value); }, [value]);
  return <textarea className={`qnode-ta ${className ?? ''}`} value={text} rows={Math.min(12, Math.max(2, Math.ceil(text.length / 90) + text.split('\n').length - 1))} onChange={e => { setText(e.target.value); onChange(e.target.value); }} {...rest} />;
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
  // a yaml card's `text` beside its title is the block's prose (a requirement in the person's words,
  // decision:wf2.req-free-text): it reads as a paragraph under the title, not as a labelled row
  const prose = p.form === 'yaml' && p.textKey !== 'text' ? parseBody(p.body).find(r => r.key === 'text')?.value ?? '' : '';
  const rows = p.form === 'yaml' ? parseBody(p.body).filter(r => r.key !== p.textKey && r.key !== 'status' && !(prose && r.key === 'text')) : [];
  return (
    <div className={`nblock k-${p.kind} ${p.check === 'done' || p.status === 'done' ? 'done' : ''} ${host.extraClass ?? ''}`} data-id={`${p.kind}:${p.slug}`} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        {(p.check || p.kind === 'task') && (
          <input type="checkbox" className="nblock-check" checked={p.check === 'done' || p.status === 'done'} onChange={e => set({ check: e.target.checked ? 'done' : 'todo', status: e.target.checked ? 'done' : 'open' })} title="done?" />
        )}
        <button type="button" className="pill k nblock-peek" style={{ background: `var(--k-${p.kind}, var(--k-other))` }} title="Open this node in the panel" onClick={host.peek}>{p.kind}</button>
        <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{(STATUSES.includes(p.status) ? [] : [p.status]).concat(STATUSES).map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
        {p.form === 'prose' && <input className={`nblock-extra ${p.extra ? '' : 'hover-only'}`} value={p.extra} placeholder="key: value" onChange={e => set({ extra: e.target.value })} />}
        <FoldToggle host={host} />
        <span className="nblock-tools hover-only">
          {p.form === 'yaml' && <button type="button" className="nblock-send" onClick={() => setShowYaml(v => !v)}>{showYaml ? 'hide yaml' : 'yaml'}</button>}
          <button type="button" className="nblock-send" title="Copy a link to this node" onClick={host.copyLink}>⧉</button>
          <button type="button" className="nblock-send" title="Send this node to an agent" onClick={host.send}>⇢</button>
        </span>
      </div>
      {host.text('nblock-text')}
      {prose && !showYaml && <div className="nblock-prose" contentEditable={false}>{prose.split(/\n{2,}/).map((para, i) => <p key={i}><Linkified text={para} /></p>)}</div>}
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
  const q = get('q');
  const id = `${p.kind}:${p.slug}`;
  const others = rows.filter(r => !['id', 'title', 'q', 'status', p.textKey].includes(r.key));
  const status = p.status || 'open';
  const a = host.answer;
  return (
    <div className={`nblock k-question qnode s-${status} ${host.extraClass ?? ''}`} data-id={id} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="qnode-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="qnode-mark" title="Open this question in the panel" onClick={host.peek}>Q</button>
        <select className={`status-sel s-${status} ${status === 'open' ? 'hover-only' : ''}`} value={status} onChange={e => set({ status: e.target.value })} title="status">{['open', 'resolved', 'rejected'].map(st => <option key={st} value={st}>{st}</option>)}</select>
        <FoldToggle host={host} />
        <span className="qnode-acts hover-only">
          <button type="button" className="nblock-send" title="Copy a link to this question" onClick={host.copyLink}>⧉</button>
          <button type="button" className="nblock-send" title="Send this question to an agent" onClick={host.send}>⇢</button>
          <button type="button" className="nblock-send" onClick={() => setDetails(d => !d)} title="id, links and the rest">{details ? 'hide details' : 'details'}</button>
        </span>
      </div>
      {host.text('qnode-title nblock-text')}
      {p.textKey !== 'q' && <div className="qnode-section" contentEditable={false} ref={host.stop}>
        <label>question</label>
        <ProseArea value={q} placeholder="the question, and why it matters" onChange={v => set({ body: setBodyField(p.body, 'q', v) })} />
      </div>}
      {/* the answer is the question's content (decision:wf2.answer-is-content): in the editor the blocks render under
          the card and this section only shows while there are none; elsewhere it opens the details */}
      {a && (a.count === 0 || !a.start) && <div className={`qnode-section qnode-answer ${a.count ? '' : 'empty'}`} contentEditable={false} ref={host.stop}>
        <label>answer</label>
        {a.count === 0
          ? <button type="button" className="qnode-ta qnode-answer-start" onClick={a.start ?? a.open}>{status === 'open' ? 'not answered yet — write the answer here; a decision block resolves it, then set the status to resolved' : 'no answer recorded'}</button>
          : <button type="button" className="qnode-ta qnode-answer-open" onClick={a.open}>{a.count} block{a.count === 1 ? '' : 's'} — open</button>}
      </div>}
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
const DECISION_ESSENCE = ['context', 'choice', 'alternatives', 'consequences'];
export function DecisionCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const [details, setDetails] = useState(false);
  const rows = parseBody(p.body);
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const id = `${p.kind}:${p.slug}`;
  const others = rows.filter(r => !['id', 'title', 'status', 'text', p.textKey, ...DECISION_ESSENCE].includes(r.key));
  return (
    <div className={`nblock k-decision dnode s-${p.status} ${host.extraClass ?? ''}`} data-id={id} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="pill k nblock-peek" style={{ background: 'var(--k-decision)' }} title="Open this decision in the panel" onClick={host.peek}>decision</button>
        <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
        <FoldToggle host={host} />
        <span className="nblock-tools hover-only">
          <button type="button" className="nblock-send" title="Copy a link to this decision" onClick={host.copyLink}>⧉</button>
          <button type="button" className="nblock-send" title="Send this decision to an agent" onClick={host.send}>⇢</button>
          <button type="button" className="nblock-send" onClick={() => setDetails(d => !d)} title="consequences, date, links and the rest">{details ? 'hide details' : 'details'}</button>
        </span>
      </div>
      {host.text('qnode-title nblock-text')}
      {/* a decision is its title and free text (decision:wf2.decision-free-text): `text` as prose, and the card's
          content blocks below it — alternative: / choice: / consequence: children where wanted. The ADR keys older
          cards carry read as prose paragraphs, not as a form; the yaml under details edits them. */}
      {get('text') && <div className="nblock-prose" contentEditable={false}>{get('text').split(/\n{2,}/).map((para, i) => <p key={i}><Linkified text={para} /></p>)}</div>}
      {DECISION_ESSENCE.filter(k => get(k)).map(k => <p key={k} className="nblock-prose dnode-legacy" contentEditable={false}><span className="muted">{k} — </span><Linkified text={get(k)} /></p>)}
      {details && (
        <div className="qnode-details" contentEditable={false} ref={host.stop}>
          {others.length > 0 && <PropRows rows={others} />}
          <textarea className="nblock-yaml" value={p.body} rows={Math.min(20, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// A content markdown split into its blocks: blank-line separated, a fence whole, each list item its own block.
export function contentBlocks(content: string): string[] {
  const out: string[] = []; let cur: string[] = []; let fence = false;
  const flush = () => { if (cur.length) out.push(cur.join('\n')); cur = []; };
  for (const l of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) { if (!fence) flush(); cur.push(l); if (fence) { flush(); } fence = !fence; continue; }
    if (fence) { cur.push(l); continue; }
    if (!l.trim()) { flush(); continue; }
    if (/^([-*+]|\d+[.)])\s/.test(l)) flush(); // a top-level item starts a block; its nested lines stay with it
    cur.push(l);
  }
  flush();
  return out;
}
