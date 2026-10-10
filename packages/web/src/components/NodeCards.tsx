'use client';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { parseBody } from '@/lib/graph';
import { sameProse, setBodyField } from '@/lib/yaml-form';
import { statusOptions } from '@/lib/props';
import { usePeek } from './PeekProvider';
import { useRouter } from 'next/navigation';
import { Linkified } from './IdLink';
import { PART_KINDS } from '@/lib/kinds';

// The cards a typed block renders as — a prose or yaml node, a question, a decision — shared by the document
// editor (the block's inline content in the text slot) and by an embed of the node on another page (a text area
// in the slot; decision:wf2.embed-renders-source-card). One set of components, so the two renderings cannot drift.

export type CardP = { kind: string; slug: string; status: string; form: string; body: string; textKey: string; extra: string; check: string; row: string };
export type CardHost = {
  text: (className: string) => ReactNode;      // the node's text: editor content or an embed's text area
  peek: () => void;                            // select the node (the Context root shows it); the fallback for a host with no `open`
  open?: () => void;                           // go into the node: the column opens it one level deeper — what the kind pill does
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
  return <button type="button" className={`nblock-fold ${f.folded ? 'folded' : ''}`} title="The description: n blocks, read and edited in the column" onClick={e => { e.stopPropagation(); f.open(); }}>{f.folded ? '▸' : '▾'} {f.count} block{f.count === 1 ? '' : 's'}</button>;
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

// What a step card offers, and only when it would work (decision:wf2.run-is-a-page): **Review** while the stage is
// `review` — its agent has finished and what its criterion still asks for is the person's — which opens the Inbox on
// exactly the nodes that hold it back, where each one can be approved, answered or rejected; and **Complete** while
// it is `ready`, which finishes the stage and starts the next. A stage whose work is still out offers neither: it
// shows what is missing in `needs`.
function StepActions({ p }: { p: CardP }) {
  const { product } = usePeek();
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const run = p.body.match(/^\s*part-of:\s*(run:[A-Za-z0-9_.\-]+)\s*$/m)?.[1];
  if (!run || (p.status !== 'ready' && p.status !== 'review')) return null;
  const complete = async () => {
    setBusy('complete'); setMsg('');
    const r = await fetch(`/api/${product}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run, action: 'advance' }) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) setMsg(j.message ?? 'could not complete this stage');
  };
  // the ids that hold the stage back are the readiness rows' — asked for here so the card never keeps a stale copy
  const review = async () => {
    setBusy('review'); setMsg('');
    const j = await fetch(`/api/${product}/runs?node=${encodeURIComponent(run)}`).then(r => r.ok ? r.json() : null).catch(() => null);
    const rows: { blocking: string[] }[] = j?.runs?.[0]?.readiness?.rows ?? [];
    const ids = [...new Set(rows.flatMap(x => x.blocking).filter(id => /^[a-z][a-z-]*:/.test(id)))];
    setBusy('');
    if (!ids.length) { setMsg('nothing of this stage waits for you'); return; }
    router.push(`/${product}/inbox?ids=${ids.map(encodeURIComponent).join(',')}`);
  };
  return (
    <>
      {p.status === 'review'
        ? <button type="button" className="step-done" disabled={!!busy} title="Everything this stage is waiting on, in the Inbox: approve, answer or reject it" onClick={review}>{busy === 'review' ? 'Opening…' : 'Review →'}</button>
        : <button type="button" className="step-done" disabled={!!busy} title="Complete this stage and start the next one" onClick={complete}>{busy === 'complete' ? 'Completing…' : 'Complete stage →'}</button>}
      {msg && <span className="bad small step-msg">{msg}</span>}
    </>
  );
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
  if (p.kind === 'slack' && p.form === 'yaml') return <SlackCard p={p} set={set} host={host} />;
  return <ProseCard p={p} set={set} host={host} />;
}

// A typed block (requirement, entity, rule, task, …): header with kind, id and status; the text; a yaml card's
// other keys read-only under it, the yaml toggle to edit them.
export function ProseCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const { statuses } = usePeek();
  const [showYaml, setShowYaml] = useState(false);
  // a yaml card's `text` beside its title is its description (decision:wf2.card-is-name-and-properties): read and
  // edited in the column, not on the card — the card is the name and the properties
  // `home: none yet` was written by propose before 2026-10-03 — where the block sits already says it has no home
  const rows = p.form === 'yaml' ? parseBody(p.body).filter(r => r.key !== p.textKey && r.key !== 'status' && r.key !== 'text' && r.key !== 'home') : [];
  // a part (when / then / unless, context / choice / alternative / consequence): the pill and the text, nothing else
  if (PART_KINDS.has(p.kind)) return (
    <div className={`nblock nblock-part k-${p.kind} ${host.extraClass ?? ''}`} data-id={`${p.kind}:${p.slug}`} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <span className="pill k" style={{ background: `var(--k-${p.kind}, var(--k-other))` }}>{p.kind}</span>
      </div>
      {host.text('nblock-text')}
    </div>
  );
  return (
    <div className={`nblock k-${p.kind} ${p.check === 'done' || p.status === 'done' ? 'done' : ''} ${host.extraClass ?? ''}`} data-id={`${p.kind}:${p.slug}`} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        {(p.check || p.kind === 'task') && (
          <input type="checkbox" className="nblock-check" checked={p.check === 'done' || p.status === 'done'} onChange={e => set({ check: e.target.checked ? 'done' : 'todo', status: e.target.checked ? 'done' : 'open' })} title="done?" />
        )}
        <button type="button" className="pill k nblock-peek" style={{ background: `var(--k-${p.kind}, var(--k-other))` }} title="Open this node in the column" onClick={host.open ?? host.peek}>{p.kind}</button>
        {(showYaml || !p.slug) && <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />}
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{statusOptions(statuses, p.kind, p.status).map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
        {p.form === 'prose' && <input className={`nblock-extra ${p.extra ? '' : 'hover-only'}`} value={p.extra} placeholder="key: value" onChange={e => set({ extra: e.target.value })} />}
        <FoldToggle host={host} />
        {p.kind === 'step' && <StepActions p={p} />}
        <span className="nblock-tools hover-only">
          <button type="button" className="nblock-send" onClick={() => setShowYaml(v => !v)} title="the id, and a card's yaml">{showYaml ? 'hide details' : 'details'}</button>
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
  const q = get('q');
  const id = `${p.kind}:${p.slug}`;
  const others = rows.filter(r => !['id', 'title', 'q', 'status', 'answer', 'by', p.textKey].includes(r.key));
  const status = p.status || 'open';
  const a = host.answer;
  return (
    <div className={`nblock k-question qnode s-${status} ${host.extraClass ?? ''}`} data-id={id} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="qnode-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="qnode-mark" title="Open this question in the column" onClick={host.open ?? host.peek}>Q</button>
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
      {a && (a.count === 0 || !a.start) && <div className={`qnode-section qnode-answer ${a.count || get('answer') ? '' : 'empty'}`} contentEditable={false} ref={host.stop}>
        <label>answer</label>
        {a.count === 0 && get('answer')
          // answered in the conversation or the PR's head: the card carries it as `answer` (lib/pr-questions withAnswer)
          ? <><ProseArea value={get('answer')} placeholder="the answer" onChange={v => set({ body: setBodyField(p.body, 'answer', v) })} />{get('by') && <small className="muted qnode-by">— {get('by')}</small>}</>
          : a.count === 0
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
export function DecisionCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const { statuses } = usePeek();
  const [details, setDetails] = useState(false);
  const rows = parseBody(p.body);
  const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const id = `${p.kind}:${p.slug}`;
  const others = rows.filter(r => !['id', 'title', 'status', 'text', p.textKey].includes(r.key));
  return (
    <div className={`nblock k-decision dnode s-${p.status} ${host.extraClass ?? ''}`} data-id={id} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="pill k nblock-peek" style={{ background: 'var(--k-decision)' }} title="Open this decision in the column" onClick={host.open ?? host.peek}>decision</button>
        {(details || !p.slug) && <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />}
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{statusOptions(statuses, 'decision', p.status).map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
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
      {details && (
        <div className="qnode-details" contentEditable={false} ref={host.stop}>
          {others.length > 0 && <PropRows rows={others} />}
          <textarea className="nblock-yaml" value={p.body} rows={Math.min(20, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// Slack's mark, in its own colours: what a slack card carries in place of the kind pill.
export function SlackIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="slack-icon" width={size} height={size} viewBox="0 0 122.8 122.8" aria-hidden="true">
      <path fill="#E01E5A" d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" />
      <path fill="#36C5F0" d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" />
      <path fill="#2EB67D" d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" />
      <path fill="#ECB22E" d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" />
    </svg>
  );
}

// A Slack thread card: the thread's title and what it is about (`summary`), where it is (#channel, last activity),
// whether it waits on the person (`attention`), and a link that opens it in Slack. The url, ids and sync times sit
// in "details" with the yaml — they are plumbing, not what the person reads.
export function SlackCard({ p, set, host }: { p: CardP; set: (patch: Partial<CardP>) => void; host: CardHost }) {
  const { statuses } = usePeek();
  const [details, setDetails] = useState(false);
  const { product } = usePeek();
  // Refresh: an agent task that re-reads this one conversation, rewrites its summary and imports only what is new,
  // linked to this card (the slack-thread-sync skill); the card then links to the session
  const [refresh, setRefresh] = useState<{ busy?: boolean; session?: string; error?: string }>({});
  const rows = parseBody(p.body);
  const get = (k: string) => (rows.find(r => r.key === k)?.value ?? '').replace(/^"(.*)"$/s, '$1');
  const url = get('url'); const channel = get('channel'); const attention = get('attention'); const involvement = get('involvement');
  const summary = get('summary'); const active = get('last_activity');
  const link = /^https:\/\//.test(url) ? url : '';
  const id = `${p.kind}:${p.slug}`;
  const startRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation(); setRefresh({ busy: true });
    const instruction = `Refresh this Slack conversation with the slack-thread-sync skill, for this one thread only (not a full sync): ${link || id}\nCard: ${id}${get('channel_id') ? `\nChannel id: ${get('channel_id')}` : ''}${get('thread_ts') ? `\nthread_ts: ${get('thread_ts')}` : ''}\nRead the whole thread, rewrite the card's summary so it covers all of it, update last_activity, last_synced and attention, and import only what is new with wye remember --ref ${id}.`;
    const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'claude-code', instruction, refs: [id], mode: 'chat' }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setRefresh(r?.ok ? { session: j.id } : { error: j.message ?? j.error ?? 'could not start the task' });
  };
  const others = rows.filter(r => !['id', 'title', 'status', 'text', 'summary', p.textKey].includes(r.key));
  return (
    <div className={`nblock k-slack snode a-${attention || 'none'} ${host.extraClass ?? ''}`} data-id={`${p.kind}:${p.slug}`} ref={host.hostRef} onClick={selectOn(host)}>
      <div className="nblock-head" contentEditable={false} ref={host.stop} onClick={host.onHeadClick}>
        <button type="button" className="slack-mark" title="Open this thread's node in the column" onClick={host.open ?? host.peek}><SlackIcon /></button>
        {(details || !p.slug) && <input className="nblock-slug" value={p.slug} spellCheck={false} readOnly={host.slugReadOnly} onChange={e => set({ slug: e.target.value.replace(/\s+/g, '-') })} placeholder="slug" />}
        {attention && attention !== 'fyi' && <span className={`slack-chip a-${attention}`} title={attention === 'reply' ? 'someone is waiting for your answer' : 'a decision or follow-up to watch'}>{attention === 'reply' ? 'needs reply' : attention}</span>}
        <select className={`status-sel s-${p.status} ${p.status ? '' : 'hover-only'}`} value={p.status} onChange={e => set({ status: e.target.value })}>{statusOptions(statuses, 'slack', p.status).map(s => <option key={s} value={s}>{s || '— status'}</option>)}</select>
        <FoldToggle host={host} />
        <span className="slack-acts">
          {refresh.session && <a className="slack-open" href={`/${product}/sessions/${refresh.session}`} onClick={e => e.stopPropagation()} title="The agent task that is refreshing this conversation">Refreshing → task</a>}
          {refresh.error && <span className="bad small">{refresh.error}</span>}
          {!refresh.session && <button type="button" className="slack-open" disabled={refresh.busy} onClick={startRefresh} title="Start an agent task that re-reads this conversation, updates the summary and imports what is new">{refresh.busy ? 'Starting…' : 'Refresh ↻'}</button>}
          {link && <a className="slack-open" href={link} target="_blank" rel="noopener noreferrer" title="Open this thread in Slack" onClick={e => e.stopPropagation()}>Open in Slack ↗</a>}
          <span className="nblock-tools hover-only">
            <button type="button" className="nblock-send" onClick={() => setDetails(d => !d)} title="the link, ids, sync times and the yaml">{details ? 'hide details' : 'details'}</button>
            <button type="button" className="nblock-send" title="Copy a link to this node" onClick={host.copyLink}>⧉</button>
            <button type="button" className="nblock-send" title="Send this node to an agent" onClick={host.send}>⇢</button>
          </span>
        </span>
      </div>
      {host.text('qnode-title nblock-text')}
      {(channel || active || involvement) && <p className="slack-meta" contentEditable={false} ref={host.stop}>{[channel && `#${channel}`, involvement, active && `active ${active}`].filter(Boolean).join(' · ')}</p>}
      {summary && <p className="slack-summary" contentEditable={false} ref={host.stop}><Linkified text={summary} /></p>}
      {details && (
        <div className="qnode-details" contentEditable={false} ref={host.stop}>
          {others.length > 0 && <PropRows rows={others} />}
          <textarea className="nblock-yaml" value={p.body} rows={Math.min(24, p.body.split('\n').length + 1)} onChange={e => set({ body: e.target.value })} />
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
