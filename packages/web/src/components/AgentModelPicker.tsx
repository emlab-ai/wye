'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LAUNCH_OPTIONS, validModel } from '@/lib/agent-launch';
import { fitMenu } from '@/lib/menu-fit';

// The agent and the model of what is about to start, as one choice (decision:wf2.pr-agent-and-model): a pill that
// says what will run — "Opus · Claude Code" — and opens a menu with every agent as a group and its models as rows,
// the one in use ticked. "Default" is the model of Settings › Agents (named when one is set there); "Other model…"
// takes any id the CLI accepts. Arrow keys move, Enter picks, Escape closes the menu and leaves the box open.
const ABOUT: Record<string, string> = {
  fable: 'The most capable — for the hardest requests',
  opus: 'For complex work and everyday tasks',
  sonnet: 'Efficient for simpler tasks',
  haiku: 'Fastest, for quick answers',
};
const nice = (m: string) => /^[a-z]+$/.test(m) ? m[0].toUpperCase() + m.slice(1) : m;
export interface PickerAgent { id: string; label: string }

export function AgentModelPicker({ agents, agent, model, onChange, what = 'runs' }: { agents: PickerAgent[]; agent: string; model: string; onChange: (agent: string, model: string) => void; what?: string }) {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [other, setOther] = useState<string | null>(null);   // the agent whose "Other model…" row is being typed in
  const [custom, setCustom] = useState('');
  const btn = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null);
  // the default model of each agent, as Settings › Agents has it — asked for when the menu first opens
  useEffect(() => {
    if (!open || Object.keys(defaults).length) return;
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(j => { if (j?.launch) setDefaults(Object.fromEntries(Object.entries(j.launch as Record<string, { model?: string }>).map(([a, l]) => [a, l?.model ?? '']))); }).catch(() => {});
  }, [open, defaults]);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect(); fitMenu(menu.current, r.left, r.bottom + 6, r.top);
    (menu.current?.querySelector('[aria-checked="true"]') as HTMLElement | null ?? menu.current?.querySelector('button'))?.focus();
  }, [open, other]);
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setOther(null); btn.current?.focus(); };
    // React's root is the document: a click is "outside" by its target, not by where it was stopped
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!menu.current?.contains(t) && !btn.current?.contains(t)) { setOpen(false); setOther(null); } };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(menu.current?.querySelectorAll<HTMLElement>('button, input') ?? [])]; if (!items.length) return;
      e.preventDefault(); e.stopPropagation();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    };
    document.addEventListener('mousedown', down); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [open]);
  const pick = (a: string, m: string) => { onChange(a, m); setOpen(false); setOther(null); btn.current?.focus(); };
  const label = agents.find(a => a.id === agent)?.label ?? agent;
  const listed = (a: string) => LAUNCH_OPTIONS[a]?.models ?? [];
  return (
    <span className="amp">
      <button ref={btn} type="button" className={`amp-pill ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} title={`The agent and the model this ${what} on`} onClick={() => setOpen(o => !o)}>
        <b>{model ? nice(model) : LAUNCH_OPTIONS[agent] ? 'Default model' : label}</b>{(model || LAUNCH_OPTIONS[agent]) && <span>{label}</span>}<i aria-hidden>▾</i>
      </button>
      {open && (
        <div ref={menu} className="amp-menu" role="menu" aria-label="Agent and model">
          {agents.map(a => {
            const opts = LAUNCH_OPTIONS[a.id];
            // an agent with no model of its own to choose (the clerk) is one row
            if (!opts) return <div key={a.id} className="amp-group"><Row on={agent === a.id} title={a.label} sub="" onPick={() => pick(a.id, '')} /></div>;
            const mine = agent === a.id; const extra = mine && model && !listed(a.id).includes(model) ? [model] : [];
            return (
              <div key={a.id} className="amp-group" role="group" aria-label={a.label}>
                <div className="amp-head">{a.label}</div>
                <Row on={mine && !model} title="Default" sub={defaults[a.id] ? `${nice(defaults[a.id])} — set in Settings › Agents` : `What the ${a.id === 'codex' ? 'codex' : 'claude'} CLI picks itself`} onPick={() => pick(a.id, '')} />
                {[...listed(a.id), ...extra].map(m => <Row key={m} on={mine && model === m} title={nice(m)} sub={ABOUT[m] ?? ''} mono={!ABOUT[m]} onPick={() => pick(a.id, m)} />)}
                {other === a.id
                  ? <form className="amp-other" onSubmit={e => { e.preventDefault(); const m = custom.trim(); if (validModel(m)) pick(a.id, m); }}>
                      <input autoFocus value={custom} placeholder={a.id === 'codex' ? 'gpt-5.1-codex' : 'claude-opus-5-5'} spellCheck={false} aria-label={`A model for ${a.label}`} onChange={e => setCustom(e.target.value)} />
                      <button type="submit" disabled={!validModel(custom.trim())}>Use</button>
                    </form>
                  : <button type="button" role="menuitem" className="amp-row amp-more" onClick={() => { setCustom(''); setOther(a.id); }}><span><b>Other model…</b></span><i aria-hidden>›</i></button>}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

function Row({ on, title, sub, mono, onPick }: { on: boolean; title: string; sub: string; mono?: boolean; onPick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} className={`amp-row ${on ? 'on' : ''}`} onClick={onPick}>
      <span><b className={mono ? 'mono' : ''}>{title}</b>{sub && <small>{sub}</small>}</span>{on && <i aria-hidden>✓</i>}
    </button>
  );
}
