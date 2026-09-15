import { parseBody } from '@/lib/graph';
import type { IndexEntry } from '@/lib/doc';
import { Linkified } from './IdLink';
import { KindPill, StatusPill, StubPill } from './Pills';

const SENTENCE: Record<string, string> = { when: 'When', then: 'then', unless: 'unless' };
const PARAGRAPH = new Set(['text', 'statement', 'description', 'purpose', 'context', 'choice', 'consequences', 'intent', 'q', 'note', 'options']);
const HIDE = new Set(['title', 'status']);

// A yaml flow list "[a, b, c]" renders as its items; anything else as linkified text.
function PropValue({ value }: { value: string }) {
  const m = value.match(/^\[(.*)\]$/s);
  if (!m) return <Linkified text={value} />;
  const items = m[1].split(/,\s*(?![^()]*\))/).map(x => x.trim()).filter(Boolean);
  if (!items.length) return <span className="muted">none</span>;
  return <span className="list">{items.map((it, i) => <span key={i} className="item"><Linkified text={it} /></span>)}</span>;
}

export function NodeCard({ id, body, entry, showYaml = false }: { id: string; body: string; entry?: IndexEntry; showYaml?: boolean }) {
  const rows = parseBody(body);
  const get = (k: string) => rows.find(r => r.key === k)?.value;
  const kind = id.split(':')[0];
  // Without an explicit title the parser derives one from the statement/description; the card shows that text
  // as a paragraph already, so the heading falls back to the id.
  const title = get('title') || (entry?.title && entry.title !== id ? entry.title : id);
  const status = get('status')?.split(/\s+#/)[0].trim() || entry?.status || '';
  const sentence = ['when', 'then', 'unless'].filter(k => get(k)).map(k => `${SENTENCE[k]} ${get(k)}`).join(', ');
  const paras = rows.filter(r => PARAGRAPH.has(r.key));
  const props = rows.filter(r => !PARAGRAPH.has(r.key) && !HIDE.has(r.key) && !(r.key in SENTENCE));
  return (
    <article className="card" id={`n-${id}`}>
      <header><KindPill kind={kind} /><StatusPill status={status} />{entry && <StubPill defined={entry.defined} />}<code className="cid">{id}</code></header>
      {!paras.some(r => r.value.startsWith(title.replace(/\s*[(:—-]*\s*$/, ''))) && <h4>{title}</h4>}
      {sentence && <p className="sentence"><Linkified text={sentence + (/[.!?]$/.test(sentence) ? '' : '.')} /></p>}
      {paras.map(r => <p key={r.key} className="para"><span className="pk">{r.key}</span> <Linkified text={r.value} /></p>)}
      {props.length > 0 && <dl className="strip">{props.map(r => <div key={r.key}><dt>{r.key}</dt><dd><PropValue value={r.value} /></dd></div>)}</dl>}
      {showYaml ? <pre className="yaml">{body}</pre> : <details className="yaml"><summary>yaml</summary><pre>{body}</pre></details>}
    </article>
  );
}
