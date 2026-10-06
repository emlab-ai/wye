'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FolderPicker, pickFolder } from './FolderPicker';

// The workspace at the top of the rail (decision:wf2.workspace-is-the-top): the folder that is open — or Home, the
// app's own products — and the way to another: Open folder…, the recent ones, Home. Rescan walks the open folder once
// and shows the links that differ from what it found; they are written only when the person says so
// (decision:wf2.vault-links).
export type RailWorkspace = { folder: string | null; name: string; recent: string[] };
type Fix = { folder: string; parent: string; vaults: string[]; was: { parent: string; vaults: string[] } };
const short = (p: string) => p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');

export function WorkspaceMenu({ workspace }: { workspace: RailWorkspace }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const [scan, setScan] = useState<{ vaults: string[]; fixes: Fix[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && box.current?.contains(e.target))) setOpen(false); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const post = async (body: object) => { const r = await fetch('/api/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed'); return j; };
  const go = async (folder: string) => {
    setBusy('open'); setMsg('');
    try { await post({ folder }); setOpen(false); setScan(null); router.push('/'); router.refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };
  const forget = async (folder: string) => {
    setBusy('forget'); setMsg('');
    try { await post({ forget: folder }); if (folder === workspace.folder) { setOpen(false); router.push('/'); } router.refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };
  const rescan = async () => {
    setBusy('scan'); setMsg(''); setScan(null);
    try { const j = await post({ rescan: true }); setScan({ vaults: j.vaults, fixes: j.fixes }); router.refresh(); window.dispatchEvent(new Event('wf:files')); } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };
  const fix = async () => {
    if (!scan) return; setBusy('fix'); setMsg('');
    try { const j = await post({ fix: scan.fixes }); setScan({ vaults: scan.vaults, fixes: [] }); setMsg(`links written in ${j.changed.length} vault${j.changed.length === 1 ? '' : 's'}`); router.refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };
  const rel = (f: string) => workspace.folder && f.startsWith(workspace.folder) ? f.slice(workspace.folder.length + 1) || '.' : short(f);
  return (
    <div className="rail-space ws-head" ref={box}>
      <button className="ws-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} title={workspace.folder ? `Workspace: ${workspace.folder}` : 'Home — every workspace kept in Wye\'s own data'}>
        <span className="rail-space-mark ws-mark" aria-hidden>{workspace.folder ? '▣' : '⌂'}</span>
        <span className="ws-name">{workspace.name}</span>
        <span className="ws-caret" aria-hidden>▾</span>
      </button>
      {open && <div className="pg-menu ws-menu" role="menu">
        <div className="menu-head muted">{workspace.folder ? short(workspace.folder) : 'Home — your workspaces'}</div>
        <div className="menu-head muted">Open workspaces</div>
        <button role="menuitem" className={`ws-item ${!workspace.folder ? 'cur' : ''}`} disabled={!!busy} onClick={() => go('')}><span className="ws-check" aria-hidden>{!workspace.folder ? '✓' : ''}</span>Home <span className="muted">— Wye&apos;s own</span></button>
        {workspace.recent.map(f => <div key={f} className={`ws-item-row ${f === workspace.folder ? 'cur' : ''}`}>
          <button role="menuitem" className="ws-item" disabled={!!busy} onClick={() => go(f)} title={f}><span className="ws-check" aria-hidden>{f === workspace.folder ? '✓' : ''}</span>{f.split('/').pop()} <span className="muted">{short(f).replace(/\/[^/]*$/, '')}</span></button>
          <button className="ws-forget" disabled={!!busy} onClick={() => forget(f)} title="Take it off this list (nothing in the folder changes)" aria-label={`Forget ${f}`}>×</button>
        </div>)}
        <button role="menuitem" disabled={!!busy} onClick={async () => { setBusy('pick'); const p = await pickFolder('Open a folder as the workspace', workspace.folder ?? ''); setBusy(''); if (p === null) setPicking(true); else if (p) void go(p); }}>{busy === 'pick' ? 'Choosing…' : 'Open folder…'}</button>
        {workspace.folder && <><div className="menu-head muted">This folder</div>
          <button role="menuitem" disabled={!!busy} onClick={rescan} title="Walk the folder once for vaults the links do not name">{busy === 'scan' ? 'Scanning…' : 'Rescan for vaults'}</button></>}
        {scan && <div className="ws-scan">
          <p>{scan.vaults.length} vault{scan.vaults.length === 1 ? '' : 's'} found{scan.fixes.length ? ` — the links of ${scan.fixes.length} differ:` : '; every link is right.'}</p>
          {scan.fixes.length > 0 && <><ul>{scan.fixes.map(f => <li key={f.folder}><code>{rel(f.folder)}</code> → parent <code>{f.parent || 'none'}</code>, below <code>{f.vaults.join(', ') || 'none'}</code></li>)}</ul>
            <button className="pri" disabled={!!busy} onClick={fix}>{busy === 'fix' ? 'Writing…' : 'Write these links'}</button></>}
        </div>}
        <div className="menu-head muted">Workspaces</div>
        <button role="menuitem" onClick={() => { setOpen(false); router.push('/new'); }}>New workspace…</button>
        <button role="menuitem" onClick={() => { setOpen(false); router.push('/new?way=open'); }}>Open or import a workspace…</button>
        {msg && <p className="notice ws-msg">{msg}</p>}
      </div>}
      {picking && <FolderPicker title="Open a folder as the workspace" start={workspace.folder ?? ''} onClose={() => setPicking(false)} onPick={p => { setPicking(false); void go(p); }} />}
    </div>
  );
}
