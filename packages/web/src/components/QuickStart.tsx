'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Onboarding, StepState } from '@/lib/onboarding';
import type { Agents } from '@/lib/agents-available';
import type { CliStatus } from '@/lib/toolchain';
import type { QuickStartLinks } from '@/lib/quick-start-links';
import { FEATURES, FeatureRow, open } from './Help';

export type QuickStartState = Onboarding & { agents: Agents; wye?: CliStatus | null };

// The Quick start (docs/superpowers/specs/2026-10-05-onboarding-design.md §2): nine steps that tick themselves from the
// product's real state. The server page reads the first state; this keeps it live — on the app's `wf:change`, on
// window focus, and on `wf:onboarding` (a dismissal or a mark made elsewhere) — so a step ticks without a reload.
export function useOnboarding(product: string, initial: QuickStartState | null) {
  const [o, setO] = useState(initial);
  useEffect(() => setO(initial), [initial]);
  const load = useCallback(() => { fetch(`/api/${product}/onboarding`).then(r => r.ok ? r.json() : null).then(j => { if (j) setO(j); }).catch(() => {}); }, [product]);
  useEffect(() => {
    const set = (e: Event) => { const j = (e as CustomEvent<QuickStartState>).detail; if (j?.steps) setO(j); };
    window.addEventListener('wf:change', load); window.addEventListener('focus', load); window.addEventListener('wf:onboarding', set);
    return () => { window.removeEventListener('wf:change', load); window.removeEventListener('focus', load); window.removeEventListener('wf:onboarding', set); };
  }, [load]);
  return [o, setO] as const;
}

// dismiss or bring back: per machine (_settings.json), told to the rail and the Overview card through `wf:onboarding`
export async function setDismissed(product: string, dismissed: boolean): Promise<QuickStartState | null> {
  const r = await fetch(`/api/${product}/onboarding`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dismissed }) });
  if (!r.ok) return null;
  const j = await r.json() as QuickStartState; window.dispatchEvent(new CustomEvent('wf:onboarding', { detail: j })); return j;
}

// a step's button(s), per the spec's action column; `primary` on the next step only
export function StepAction({ step, product, links, primary }: { step: StepState; product: string; links: QuickStartLinks; primary?: boolean }) {
  const base = `/${product}`; const cls = primary ? 'btn pri' : 'btn';
  const go = (href: string, label: string) => <Link className={cls} href={href}>{label}</Link>;
  const act = (fn: () => void, label: string, c = cls) => <button type="button" className={c} onClick={fn}>{label}</button>;
  switch (step.key) {
    case 'agent': return go(`/settings?from=${product}`, 'Agent settings');
    case 'document': return <>{act(() => open.newPage(), 'New document')}{act(() => open.newPage(true), 'Import code or Markdown', 'btn')}</>;
    case 'block': return links.doc ? go(links.doc, 'Open your document') : act(() => open.newPage(), 'New document');
    case 'link': return go(`${base}/knowledge`, 'Open Knowledge');
    case 'remember': return act(open.remember, 'Remember a note');
    case 'approve': return go(`${base}/inbox`, 'Open the Inbox');
    case 'ask': return act(open.search, 'Ask a question');
    case 'pr': return act(open.pr, 'New Prompt Request');
    case 'build': return links.pr ? go(links.pr, 'Open the newest Prompt Request') : go(`${base}/prs`, 'Open PRs');
  }
}

const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const agentName = (a: Agents) => a.claude && a.codex ? 'Claude Code and Codex found' : a.claude ? 'Claude Code found' : 'Codex found';

// what a step shows under its reason: the agent check, the line to type
function StepExtra({ step, agents }: { step: StepState; agents: Agents }): ReactNode {
  if (step.key === 'agent') return step.done ? <p className="qs-found">{agentName(agents)} on this machine.</p> : (
    <div className="qs-notice">
      <p>Neither <code>claude</code> nor <code>codex</code> is on this machine’s PATH. Without one, documents, the graph and <code>wye check</code> work; the librarian, builds, Ask’s answers, Remember and contradiction checks do not.</p>
      <p>Install <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a> or <a href="https://github.com/openai/codex" target="_blank" rel="noreferrer">Codex</a>, then come back to this page.</p>
    </div>
  );
  if (step.key === 'block' && !step.done) return <p className="qs-type">Type on a line of its own: <code>req:search.fast Search shows results within a second.</code></p>;
  return null;
}

function StepRow({ step, n, next, product, links, agents }: { step: StepState; n: number; next: boolean; product: string; links: QuickStartLinks; agents: Agents }) {
  return (
    <li className={`qs-step${step.done ? ' done' : ''}${next ? ' next' : ''}`}>
      <span className="qs-mark" aria-label={step.done ? 'done' : 'not done yet'}>{step.done ? <Check /> : n}</span>
      <div className="qs-text">
        <div className="qs-title"><b>{step.title}</b>{step.shortcut && <kbd>{step.shortcut}</kbd>}</div>
        <p className="qs-why">{step.why}</p>
        <StepExtra step={step} agents={agents} />
      </div>
      {!step.done && <div className="qs-act"><StepAction step={step} product={product} links={links} primary={next} /></div>}
    </li>
  );
}

// What this machine has, at the foot of the page: the two coding agents and the `wye` command (which the app installs at
// startup; the button does it again, e.g. when the link points at a checkout that moved). Rechecked with the page.
const tilde = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, '~');
type Tool = { key: string; ok: boolean; warn?: boolean; title: string; why: ReactNode; action?: ReactNode };

function MachineRow({ t }: { t: Tool }) {
  const state = t.ok ? (t.warn ? 'warn' : 'ok') : 'bad';
  return (
    <li className={`qs-step qs-tool ${state}`}>
      <span className="qs-mark" aria-hidden>{t.ok ? (t.warn ? '!' : <Check />) : '×'}</span>
      <div className="qs-text">
        <div className="qs-title"><b>{t.title}</b></div>
        <p className="qs-why">{t.why}</p>
      </div>
      {t.action && <div className="qs-act">{t.action}</div>}
    </li>
  );
}

function Machine({ agents, wye, onChange }: { agents: Agents; wye: CliStatus | null | undefined; onChange: () => void }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const install = async () => {
    setBusy(true); setMsg('');
    try { const r = await fetch('/api/system/cli', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (r.ok) onChange(); else setMsg(j.message || 'Could not install wye.'); }
    finally { setBusy(false); }
  };
  const ext = (href: string, label: string) => <a className="btn" href={href} target="_blank" rel="noreferrer">{label}</a>;
  const wyeOk = !!(wye?.installed || wye?.elsewhere);
  const tools: Tool[] = [
    { key: 'claude', ok: agents.claude, title: agents.claude ? 'Claude Code is installed' : 'Claude Code is not installed',
      why: agents.claude ? <><code>claude</code> is on your PATH. It runs the librarian, Ask, Remember and builds.</> : <>Without <code>claude</code> or <code>codex</code>, the librarian, Ask, Remember and builds do not run.</>,
      action: agents.claude ? undefined : ext('https://claude.com/claude-code', 'Install Claude Code') },
    { key: 'codex', ok: agents.codex, title: agents.codex ? 'Codex is installed' : 'Codex is not installed',
      why: agents.codex ? <><code>codex</code> is on your PATH. Pick it as the agent in Settings › Agents.</> : <>Optional: a second coding agent, chosen in Settings › Agents.</>,
      action: agents.codex ? undefined : ext('https://github.com/openai/codex', 'Install Codex') },
    { key: 'wye', ok: wyeOk, warn: wyeOk && (!!wye?.elsewhere || !wye?.onPath),
      title: !wye ? 'wye: could not check' : wye.installed ? 'wye is installed' : wye.elsewhere ? 'wye is installed from another checkout' : 'wye is not installed',
      why: !wye ? 'The app could not read the install state.'
        : wyeOk ? <><code>{tilde(wye.link)}</code>{wye.onPath ? ' — agents and your terminal read and write the product through it.' : <> — add <code>{tilde(wye.dir)}</code> to your PATH to use it in a terminal.</>}{wye.elsewhere && ' It runs a different copy of Wye than this app.'}</>
        : wye.blocked ? <><code>{tilde(wye.link)}</code> is a file that is not Wye’s; it was left as it is.</>
        : <>The command agents use to read and write the product. The app’s own agents work without it; your terminal and Claude Code sessions need it.</>,
      action: wye && !wye.installed && !wye.blocked ? <button type="button" className="btn pri" disabled={busy} onClick={() => void install()}>{busy ? 'Installing…' : wye.elsewhere ? 'Use this copy' : 'Install wye'}</button> : undefined },
  ];
  const ready = tools.filter(t => t.ok).length;
  return (
    <section className="qs-group qs-machine" aria-label="This machine">
      <h2>This machine <span className="qs-count">{ready}/{tools.length}</span></h2>
      <p className="lede">What Wye found on this computer. Checked when the app starts and again whenever you come back to this page.</p>
      <ul className="qs-steps">{tools.map(t => <MachineRow key={t.key} t={t} />)}</ul>
      {msg && <p className="qs-notice" role="alert">{msg}</p>}
    </section>
  );
}

const GROUPS: { key: StepState['group']; title: string }[] = [{ key: 'setup', title: 'Set up' }, { key: 'loop', title: 'The loop' }];

export function QuickStart({ product, initial, links }: { product: string; initial: QuickStartState; links: QuickStartLinks }) {
  const [state, setState] = useOnboarding(product, initial); const o = state ?? initial;
  const reload = () => { fetch(`/api/${product}/onboarding`).then(r => r.ok ? r.json() : null).then(j => { if (j) setState(j); }).catch(() => {}); };
  const router = useRouter();
  const base = `/${product}`;
  const dismiss = async (d: boolean) => { const j = await setDismissed(product, d); if (j) { setState(j); router.refresh(); } };
  let n = 0;
  return (
    <div className="page qs">
      <header className="doc-head">
        <h1 className="prop-in h1" style={{ margin: 0 }}>Quick start</h1>
        <p className="sub">{o.complete ? 'all nine done — the product has a definition, the loop has run once' : `${o.done} of ${o.total} done — the steps tick themselves as the product fills in`}</p>
        <div className="qs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={o.total} aria-valuenow={o.done}><i style={{ width: `${(o.done / o.total) * 100}%` }} /></div>
      </header>
      {GROUPS.map(g => { const steps = o.steps.filter(s => s.group === g.key); return (
        <section key={g.key} className="qs-group">
          <h2>{g.title} <span className="qs-count">{steps.filter(s => s.done).length}/{steps.length}</span></h2>
          <ol className="qs-steps">{steps.map(s => <StepRow key={s.key} step={s} n={++n} next={o.next === s.key} product={product} links={links} agents={o.agents} />)}</ol>
        </section>
      ); })}
      <section className="qs-group">
        <h2>Go further</h2>
        <p className="lede">Not tracked. Each lives in its own place in the app; this is where to find it.</p>
        <div className="qs-further">{FEATURES.filter(f => f.further).map(f => <FeatureRow key={f.key} f={f} base={base} links={links} />)}</div>
      </section>
      <Machine agents={o.agents} wye={o.wye} onChange={reload} />
      <footer className="qs-foot">
        {o.complete ? <p className="muted">Every step is done, so the rail and the Overview no longer show the Quick start. Help (?) opens it again.</p>
          : o.dismissed ? <><p className="muted">Hidden from the rail and the Overview on this machine.</p><button type="button" className="btn" onClick={() => void dismiss(false)}>Show it in the rail again</button></>
          : <><button type="button" className="btn" onClick={() => void dismiss(true)}>I know my way around</button><p className="muted">Hides the Quick start from the rail and the Overview. Help (?) brings it back.</p></>}
      </footer>
    </div>
  );
}

// the Overview's documents when there are none (spec §3): the two ways to the first document
export function NewDocumentActions() {
  return <><button type="button" className="pri" onClick={() => open.newPage()}>New document</button><button type="button" onClick={() => open.newPage(true)}>Import code or Markdown</button></>;
}
