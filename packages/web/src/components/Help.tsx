'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { requestSend } from './CommandBox';
import type { QuickStartLinks } from '@/lib/quick-start-links';

// The openers other parts of the app call to teach in place (docs/superpowers/specs/2026-10-05-onboarding-design.md):
// the Help sheet (Shell), the New page sheet (Rail, on Import when asked), the search panel (Shell), and the command
// box in Remember or Prompt Request mode (CommandBox).
export const open = {
  help: () => window.dispatchEvent(new Event('wf:help')),
  newPage: (importing = false) => window.dispatchEvent(new CustomEvent('wf:new-page', { detail: { import: importing } })),
  search: () => window.dispatchEvent(new Event('wf:search')),
  remember: () => requestSend({ mode: 'remember' }),
  pr: () => requestSend({ mode: 'pr' }),
};

// Every important feature named once, where it lives: Help's "What is where" lists them all, the Quick start's
// "Go further" the ones marked `further`. An entry goes to a page (`href`), opens something (`act`), or is a command.
export type Feature = { key: string; icon: string; title: string; line: string; href?: (base: string, l: QuickStartLinks) => string | undefined; act?: () => void; cmd?: string; further?: boolean };
export const FEATURES: Feature[] = [
  { key: 'inbox', icon: '⇩', title: 'Inbox', line: 'What agents propose and what Remember files, waiting for a person to approve.', href: b => `${b}/inbox` },
  { key: 'remember', icon: '✦', title: 'Remember', line: 'Paste a note, a transcript or a decision; the librarian files it as proposed knowledge.', act: () => open.remember() },
  { key: 'ask', icon: '⌕', title: 'Search and Ask', line: 'Find any block, page or session, or ask a question and get an answer with its sources.', act: () => open.search() },
  { key: 'prs', icon: '🗺', title: 'Prompt Requests', line: 'Your suggestion to change the knowledge, refined with the librarian, approved, then built.', href: b => `${b}/prs` },
  { key: 'knowledge', icon: '◈', title: 'Knowledge', line: 'Every block with an id, by kind, with its links and where it is written.', href: b => `${b}/knowledge` },
  { key: 'map', icon: '◇', title: 'Mind map', line: 'A page whose nodes are its own blocks: drag, link and group them, and the document follows.', act: () => open.newPage(), further: true },
  { key: 'tables', icon: '▦', title: 'Tables and SQL', line: 'A table on a page is a query over the graph; write the SQL or ask for it in words.', href: b => `${b}/knowledge`, further: true },
  { key: 'constitution', icon: '§', title: 'Constitution', line: 'The product’s standing constraints, given to every agent before it starts.', href: b => `${b}/constitution`, further: true },
  { key: 'types', icon: '⬡', title: 'Types', line: 'The product’s own vocabulary: kinds of pages and blocks, with their fields.', href: b => `${b}/types`, further: true },
  { key: 'work', icon: '☑', title: 'Work', line: 'Every task in every document as one board, whoever holds it.', href: b => `${b}/work`, further: true },
  { key: 'hooks', icon: '⚓', title: 'Hooks and skills', line: 'Skills are the agents’ prompts, kept as documents you can edit; hooks run them when something happens.', href: (_, l) => l.hooks ?? l.skills, further: true },
  { key: 'agents', icon: '⚡', title: 'Agents', line: 'Every agent run with its log, what it changed and what it asked.', href: b => `${b}/sessions` },
  { key: 'graph', icon: '⌬', title: 'Graph', line: 'The blocks and their links, drawn, from any block outwards.', href: b => `${b}/graph` },
  { key: 'packages', icon: '▣', title: 'Packages', line: 'Ready-made skills, workflows, templates and types to install into a project.', cmd: 'wye packages', further: true },
  { key: 'cli', icon: '›_', title: 'The wye CLI and Claude Code skills', line: 'Agents read and write the product through wye; the wye-context and wye-agent skills teach Claude Code how.', cmd: 'wye setup', further: true },
];

const SHORTCUTS: [string, string][] = [
  ['⌘P', 'Command box'], ['⌘M', 'Remember'], ['⌘F', 'Search and Ask'],
  ['⌘\\', 'Show or hide the rail'], ['⌘.', 'Show or hide the panel'], ['⌘↵', 'Send, run'], ['⌘/', 'This sheet'],
];
const GITHUB = 'https://github.com/emlab-ai/wye';
const DOCS: [string, string][] = [['README', `${GITHUB}#readme`], ['Reference', `${GITHUB}/blob/main/docs/reference.md`], ['Type system', `${GITHUB}/blob/main/docs/type-system.md`], ['Queries', `${GITHUB}/blob/main/docs/query.md`]];

// One feature as a row: a link to its page, a button that opens it, or the command that runs it
export function FeatureRow({ f, base, links, onGo }: { f: Feature; base: string; links: QuickStartLinks; onGo?: () => void }) {
  const href = f.href?.(base, links);
  const body = <><i aria-hidden>{f.icon}</i><span><b>{f.title}</b><small>{f.line}</small>{f.cmd && <code>{f.cmd}</code>}</span></>;
  if (href) return <Link className="help-row" href={href} onClick={onGo}>{body}</Link>;
  if (f.act) return <button type="button" className="help-row" onClick={() => { onGo?.(); f.act!(); }}>{body}</button>;
  return <div className="help-row">{body}</div>;
}

// The wye command and the Claude Code skills, installed from here (POST /api/system/cli) — the same as `wye setup`
function CliInstall() {
  const [st, setSt] = useState<{ installed?: boolean; elsewhere?: boolean; onPath?: boolean; link?: string; dir?: string } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/system/cli').then(r => r.ok ? r.json() : null).then(setSt).catch(() => {}); }, []);
  const install = async () => {
    setMsg('');
    const r = await fetch('/api/system/cli', { method: 'POST' }); const j = await r.json().catch(() => ({}));
    if (r.ok) setSt(j); else setMsg(j.message || 'could not install');
  };
  return (
    <div className="help-qs">
      <button type="button" className="btn" onClick={() => void install()}>{st?.installed ? 'Reinstall the wye command and skills' : 'Install the wye command and skills'}</button>
      {st?.elsewhere && !st.installed && <small>{st.link} runs another checkout; install to use this one</small>}
      {st?.installed && <small>{st.link}{st.onPath ? ' — on your PATH' : ` — add ${st.dir} to your PATH`}</small>}
      {msg && <small role="alert">{msg}</small>}
    </div>
  );
}

// The Help sheet (spec §4): the `?` in the rail, ⌘/ or a `wf:help` event opens it; Esc or a click outside closes it
export function Help({ product, links, onClose }: { product: string; links: QuickStartLinks; onClose: () => void }) {
  const base = `/${product}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { fetch(`/api/${product}/onboarding`).then(r => r.ok ? r.json() : null).then(j => setDismissed(!!j?.dismissed)).catch(() => {}); }, [product]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);
  // un-dismiss on request: the rail item and the Overview card come back
  const reopen = async () => {
    const r = await fetch(`/api/${product}/onboarding`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dismissed: false }) });
    if (r.ok) { const j = await r.json(); setDismissed(false); window.dispatchEvent(new CustomEvent('wf:onboarding', { detail: j })); }
  };
  return (
    // React's root is document: closing on outside clicks checks the target, not stopPropagation
    <div className="modal-back help-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal help-sheet" role="dialog" aria-label="Help">
        <div className="help-top"><h3>Help</h3><button type="button" className="help-x" onClick={onClose} aria-label="Close" title="Close (Esc)">×</button></div>
        <section>
          <h4>Shortcuts</h4>
          <dl className="help-keys">{SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
          <p className="help-note">Ctrl in place of ⌘ on Windows and Linux; in a browser on a Mac, ⌘M minimizes the window, so Remember is Ctrl+M there.</p>
        </section>
        <section>
          <h4>Quick start</h4>
          <div className="help-qs">
            <Link className="btn" href={`${base}/start`} onClick={onClose}>Open Quick start</Link>
            {dismissed && <button type="button" onClick={() => void reopen()}>Show it in the rail again</button>}
          </div>
        </section>
        <section>
          <h4>What is where</h4>
          <div className="help-list">{FEATURES.map(f => <FeatureRow key={f.key} f={f} base={base} links={links} onGo={onClose} />)}</div>
        </section>
        <section>
          <h4>Install</h4>
          <CliInstall />
        </section>
        <section>
          <h4>Read more</h4>
          <p className="help-docs">{DOCS.map(([t, u], i) => <span key={u}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer">{t}</a></span>)}</p>
        </section>
      </div>
    </div>
  );
}
