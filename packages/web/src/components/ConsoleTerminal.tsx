'use client';
import { useState, type ReactNode } from 'react';
import { TranscriptMarkdown } from './TranscriptMarkdown';
import { lineDiff } from '@/lib/diff';
import type { ChatEvent } from '@/lib/session-types';

// The console's events drawn the way Claude Code draws its own transcript (req:wf2.sessions.quiet-console): `❯` the
// person's words, `●` the agent's, a tool call as `● Name(what)` with its result under a `⎿`, an edit as the diff of
// the lines it changed, a run of calls folded to "Read 2 files, ran a command", the turn's end as `✻ Done (time)`.
type Input = Record<string, unknown> | undefined;
const str = (v: unknown) => typeof v === 'string' ? v : '';
const base = (p: string) => p.split('/').pop() ?? p;
const secs = (ms: number) => ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
const k = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

// what a call is doing, in a few words — the name as Claude Code shows it (Update for an edit) and its argument
export function callLabel(e: ChatEvent): { verb: string; what: string } {
  const i = e.input as Input;
  switch (e.name) {
    case 'Bash': return { verb: 'Bash', what: str(i?.description) || str(i?.command).split('\n')[0] };
    case 'Read': return { verb: 'Read', what: str(i?.file_path) };
    case 'Edit': case 'MultiEdit': return { verb: 'Update', what: str(i?.file_path) };
    case 'Write': return { verb: 'Write', what: str(i?.file_path) };
    case 'Grep': return { verb: 'Search', what: `${str(i?.pattern)}${i?.path ? ` in ${str(i.path)}` : ''}` };
    case 'Glob': return { verb: 'Glob', what: str(i?.pattern) };
    case 'WebFetch': return { verb: 'Fetch', what: str(i?.url) };
    case 'WebSearch': return { verb: 'Web search', what: str(i?.query) };
    case 'Task': case 'Agent': return { verb: 'Agent', what: str(i?.description) || str(i?.prompt).slice(0, 80) };
    case 'TodoWrite': return { verb: 'Todo', what: '' };
    case 'AskUserQuestion': { const qs = (i?.questions as { question?: string }[] | undefined) ?? []; return { verb: 'Asked', what: qs.map(q => q.question ?? '').filter(Boolean).join(' · ').slice(0, 160) }; }
    default: return { verb: e.name ?? 'tool', what: str(i?.command ?? i?.file_path ?? i?.pattern ?? i?.query ?? i?.description ?? i?.path ?? i?.url) || JSON.stringify(i ?? {}).slice(0, 100) };
  }
}
// the one-line sense of a result, as Claude Code's `⎿` says it
export function resultLine(call: ChatEvent | undefined, r: ChatEvent | undefined): string {
  if (!r) return call ? '…' : '';
  const out = r.output ?? ''; const lines = out ? out.split('\n') : [];
  if (r.isError) return `Error: ${lines[0]?.slice(0, 160) ?? ''}`;
  switch (call?.name) {
    case 'Read': return `Read ${Math.max(0, lines.length)} lines`;
    case 'Edit': case 'MultiEdit': case 'Write': { const i = call.input as Input; const d = call.name === 'Write' ? { add: str(i?.content).split('\n').length, del: 0 } : counts(str(i?.old_string), str(i?.new_string)); return `${call.name === 'Write' ? 'Wrote' : 'Updated'} ${base(str(i?.file_path))}${d.add ? ` +${d.add}` : ''}${d.del ? ` −${d.del}` : ''}`; }
    case 'Grep': case 'Glob': return `${lines.filter(Boolean).length} result${lines.filter(Boolean).length === 1 ? '' : 's'}`;
    default: return lines.length ? `${lines[0].slice(0, 160)}${lines.length > 1 ? ` … +${lines.length - 1} lines` : ''}` : '(no output)';
  }
}
const counts = (a: string, b: string) => { const d = lineDiff(a, b); return { add: d.filter(r => r.kind === 'add').length, del: d.filter(r => r.kind === 'del').length }; };

// "Read 3 files, ran 2 commands, updated 1 file" — the fold's summary of a run of calls
export function foldSummary(calls: ChatEvent[]): string {
  const n = (p: (e: ChatEvent) => boolean) => calls.filter(p).length;
  const parts = [[n(e => e.name === 'Read'), 'read', 'file'], [n(e => e.name === 'Bash'), 'ran', 'command'], [n(e => e.name === 'Edit' || e.name === 'MultiEdit' || e.name === 'Write'), 'changed', 'file'], [n(e => e.name === 'Grep' || e.name === 'Glob'), 'searched', 'time'], [n(e => e.name === 'Task' || e.name === 'Agent'), 'sent', 'agent']] as [number, string, string][];
  const said = parts.filter(([c]) => c).map(([c, verb, noun]) => `${verb} ${c} ${noun}${c === 1 ? '' : 's'}`);
  const other = calls.length - parts.reduce((a, [c]) => a + c, 0);
  if (other > 0) said.push(`${other} other call${other === 1 ? '' : 's'}`);
  return said.length ? said.join(', ').replace(/^./, c => c.toUpperCase()) : `${calls.length} call${calls.length === 1 ? '' : 's'}`;
}

// a call with its result: the line, and what opens under it
export function Call({ call, result, live = true, open: initial = false }: { call: ChatEvent; result?: ChatEvent; /** the session is running: a call without a result is still running, else its result was not kept */ live?: boolean; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  const { verb, what } = callLabel(call); const i = call.input as Input;
  const edit = call.name === 'Edit' || call.name === 'MultiEdit'; const write = call.name === 'Write';
  const diff = edit ? lineDiff(str(i?.old_string), str(i?.new_string)) : write ? str(i?.content).split('\n').map(text => ({ kind: 'add' as const, text })) : null;
  const ms = result && call.t ? Date.parse(result.t) - Date.parse(call.t) : 0;
  return (
    <div className={`tc ${result?.isError ? 'err' : ''}`}>
      <button className="tc-line" onClick={() => setOpen(o => !o)} title={open ? 'Fold' : 'Show the whole call'}>
        <span className="tc-dot" aria-hidden>●</span><b>{verb}</b><span className="tc-what">({what})</span>{ms > 1500 && <span className="tc-ms">{secs(ms)}</span>}
      </button>
      <div className="tc-res"><span className="tc-elbow" aria-hidden>⎿</span>{result ? <span>{resultLine(call, result)}</span> : live ? <span className="tc-busy"><i className="live-dot" /> running…</span> : <span className="muted">no result kept</span>}</div>
      {diff && (open || diff.length <= 40) && <Diff runs={diff} full={open} />}
      {open && !diff && <pre className="tc-pre">{call.name === 'Bash' ? str(i?.command) : JSON.stringify(i, null, 2)}</pre>}
      {open && result?.output && <pre className="tc-pre tc-out">{result.output.slice(0, 20000)}</pre>}
    </div>
  );
}
// the changed lines, numbered from the new text's side, with three lines of context around each change
function Diff({ runs, full }: { runs: { kind: 'same' | 'del' | 'add'; text: string }[]; full: boolean }) {
  const keep = new Set<number>();
  runs.forEach((r, n) => { if (r.kind !== 'same') for (let d = -3; d <= 3; d++) keep.add(n + d); });
  const rows: ReactNode[] = []; let gap = 0; let no = 0;
  runs.forEach((r, n) => {
    if (r.kind !== 'del') no++;
    if (!full && !keep.has(n)) { gap++; return; }
    if (gap) { rows.push(<div key={`g${n}`} className="td-gap">… {gap} unchanged line{gap === 1 ? '' : 's'}</div>); gap = 0; }
    rows.push(<div key={n} className={`td-row td-${r.kind}`}><span className="td-no">{r.kind === 'del' ? '' : no}</span><span className="td-sign">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span><span className="td-text">{r.text || ' '}</span></div>);
  });
  if (gap) rows.push(<div key="gend" className="td-gap">… {gap} unchanged line{gap === 1 ? '' : 's'}</div>);
  return <div className="td">{rows}</div>;
}
