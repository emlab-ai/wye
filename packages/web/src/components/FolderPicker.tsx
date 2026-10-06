'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// A folder on this machine, chosen by browsing (GET /api/system/folders): the app runs where the folders are, and a
// browser's own picker never gives a path. FolderField is the text field with Choose… beside it — typing still works;
// the sheet walks folders (double-click or Enter opens one), can make a new one, and hands back the folder it is in.
type List = { path: string; parent: string | null; home: string; folders: { name: string; product: boolean }[]; product: boolean };

// The system's folder dialog (POST /api/system/folders { pick }) — the app runs on the machine the folders are on, so
// Choose… opens Finder's, the shell's or zenity's; resolves to the path, '' when cancelled, null when there is none
export async function pickFolder(title: string, start = ''): Promise<string | null> {
  try { const r = await fetch('/api/system/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pick: true, title, start }) }); if (r.status === 501) return null; const j = await r.json(); return r.ok ? String(j.path ?? '') : null; } catch { return null; }
}
export function FolderField({ value, onChange, placeholder, autoFocus, onEnter, title = 'Choose a folder' }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onEnter?: () => void; title?: string }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const choose = async () => { setBusy(true); const p = await pickFolder(title, value); setBusy(false); if (p === null) setOpen(true); else if (p) onChange(p); };
  return (
    <span className="folder-field">
      <input autoFocus={autoFocus} value={value} placeholder={placeholder} spellCheck={false} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }} />
      <button type="button" disabled={busy} onClick={choose}>{busy ? 'Choosing…' : 'Choose…'}</button>
      {open && <FolderPicker title={title} start={value} onClose={() => setOpen(false)} onPick={p => { onChange(p); setOpen(false); }} />}
    </span>
  );
}

export function FolderPicker({ start = '', title, onPick, onClose }: { start?: string; title: string; onPick: (path: string) => void; onClose: () => void }) {
  const [list, setList] = useState<List | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const go = useCallback(async (p: string, h = hidden) => {
    setMsg('');
    try { const r = await fetch(`/api/system/folders?path=${encodeURIComponent(p)}${h ? '&hidden=1' : ''}`); setList(await r.json()); setSel(null); setNaming(null); }
    catch (e) { setMsg(String(e)); }
  }, [hidden]);
  useEffect(() => { void go(start); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', key, true); return () => document.removeEventListener('keydown', key, true); }, [onClose]);
  const join = (name: string) => list ? `${list.path.replace(/\/$/, '')}/${name}` : name;
  const make = async () => {
    if (!list || !naming?.trim()) return;
    const r = await fetch('/api/system/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parent: list.path, name: naming }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg(j.message ?? 'could not make the folder'); return; }
    setList(j); setSel(null); setNaming(null); setMsg('');
  };
  // the path as crumbs: ~ for the home folder, then each folder down to here
  const crumbs: { label: string; path: string }[] = [];
  if (list) {
    const inHome = list.path === list.home || list.path.startsWith(list.home + '/');
    const rest = (inHome ? list.path.slice(list.home.length) : list.path).split('/').filter(Boolean);
    let at = inHome ? list.home : ''; crumbs.push({ label: inHome ? '~' : '/', path: inHome ? list.home : '/' });
    for (const seg of rest) { at = `${at}/${seg}`; crumbs.push({ label: seg, path: at }); }
  }
  const target = list ? (sel ? join(sel) : list.path) : '';
  // on the body: the field sits inside a <label>, which would take the sheet's clicks for its input
  return createPortal(
    <div className="modal-back folder-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal folder-picker" role="dialog" aria-label={title}>
        <div className="folder-head"><h3>{title}</h3><button type="button" className="np-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="folder-crumbs">
          <button type="button" className="folder-up" disabled={!list?.parent} onClick={() => list?.parent && go(list.parent)} title="The folder above" aria-label="Up">↑</button>
          {crumbs.map((c, i) => <span key={c.path}>{i > 0 && <i>/</i>}<button type="button" className={i === crumbs.length - 1 ? 'here' : ''} onClick={() => go(c.path)}>{c.label}</button></span>)}
        </div>
        <ul className="folder-list" role="listbox" aria-label="Folders">
          {list?.folders.map(f => (
            <li key={f.name}><button type="button" role="option" aria-selected={sel === f.name} className={sel === f.name ? 'on' : ''} onClick={() => setSel(f.name)} onDoubleClick={() => go(join(f.name))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void go(join(f.name)); } }}>
              <i>📁</i><span>{f.name}</span>{f.product && <em>a Wye product</em>}</button></li>))}
          {list && !list.folders.length && <li className="muted folder-none">No folders in here.</li>}
          {!list && <li className="muted folder-none">…</li>}
        </ul>
        {naming !== null && <div className="folder-new"><input autoFocus value={naming} placeholder="Name of the new folder" onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void make(); if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); } }} /><button type="button" onClick={make} disabled={!naming.trim()}>Make</button></div>}
        {msg && <p className="notice">{msg}</p>}
        <div className="folder-foot">
          <button type="button" onClick={() => setNaming(naming === null ? '' : null)}>New folder</button>
          <label className="muted small"><input type="checkbox" checked={hidden} onChange={e => { setHidden(e.target.checked); if (list) void go(list.path, e.target.checked); }} /> hidden folders</label>
          <span className="np-spacer" />
          <code className="folder-target" title={target}>{target.length > 38 ? `…${target.slice(-37)}` : target}</code>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="pri" disabled={!list} onClick={() => onPick(target)}>Choose</button>
        </div>
      </div>
    </div>, document.body);
}
