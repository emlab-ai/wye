'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitMenu } from '@/lib/menu-fit';
import { IconEye, IconRefresh } from './Icons';
import { usePeekMaybe } from './PeekProvider';

// The Files section of the rail (req:wf2.workspace-files, decision:wf2.files-are-code-tabs): the open folder as a tree,
// a folder listed when it is opened (op:api.workspace-files). A file opens in a tab with the code view; right-click
// does what a file browser's does — open here or in the column, in its own application, Reveal in Finder, cut / copy /
// paste, copy the path, rename, delete (to the system's trash), new file and folder — and, for Wye, Init Wye here on a
// folder that has no vault of its own (for a file, its folder) or Reveal in Documents on one that has. What git
// ignores and build folders are left out until "show ignored" is on.
type Entry = { name: string; dir: boolean; vault?: boolean; product?: boolean; ignored?: boolean };
type Listing = { root: string; name: string; path: string; entries: Entry[]; vault: string; own: boolean };
type Menu = { path: string; dir: boolean; x: number; y: number; state: 'loading' | 'ready'; folder: string; own: boolean; vault: string; /** the folder is itself a product kept the old way: nothing to init */ product?: boolean; /** a name being typed in the menu: for a rename, a new file or a new folder */ ask?: { kind: 'rename' | 'newfile' | 'mkdir'; value: string } };
type Clip = { path: string; mode: 'cut' | 'copy' };
export const fileHref = (product: string, rel: string) => `/${product}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;

export function FileTree({ product, embedded = false, bare = false, filter = '', onOpenFile }: { product: string; /** the rail's filter field: a file shows when its name holds the text; a folder stays, since what is in a closed one is not known yet */ filter?: string; /** on a page without a rail: a file is handed to the page, not opened as a tab */ embedded?: boolean; /** no head of its own: the rail's pane head holds the tools and sends `wf:files` (reload) and `wf:files-hidden` (toggle) */ bare?: boolean; onOpenFile?: (rel: string) => void }) {
  const path = usePathname(); const router = useRouter();
  const [lists, setLists] = useState<Record<string, Listing | { error: string }>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null); const menuEl = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState('');
  const [clip, setClip] = useState<Clip | null>(null); // what Cut or Copy took, until Paste
  const [note, setNote] = useState<{ text: string; href: string; label: string } | null>(null); // what Init Wye here did, with the way to the new vault
  const peek = usePeekMaybe();
  const q = product ? `product=${encodeURIComponent(product)}&` : '';
  const load = useCallback(async (dir: string, h = hidden): Promise<Listing | null> => {
    try {
      const r = await fetch(`/api/workspace/files?${q}dir=${encodeURIComponent(dir)}${h ? '&hidden=1' : ''}`); const j = await r.json();
      if (!r.ok) { setLists(l => ({ ...l, [dir]: { error: j.message ?? j.error } })); return null; }
      setLists(l => ({ ...l, [dir]: j })); return j as Listing;
    } catch (e) { setLists(l => ({ ...l, [dir]: { error: String(e) } })); return null; }
  }, [q, hidden]);
  // the root, and every folder that was open the last time (remembered per root in this browser)
  useEffect(() => {
    let live = true;
    void load('').then(root => {
      if (!live || !root) return;
      let was: Record<string, boolean> = {}; try { was = JSON.parse(localStorage.getItem(`wf-files-open:${root.root}`) ?? '{}'); } catch { /* none */ }
      setOpen(was); for (const d of Object.keys(was)) if (was[d]) void load(d);
    });
    return () => { live = false; };
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const root = lists[''] && !('error' in lists['']) ? lists[''] as Listing : null;
  const remember = (n: Record<string, boolean>) => { if (root) try { localStorage.setItem(`wf-files-open:${root.root}`, JSON.stringify(n)); } catch { /* ignore */ } };
  const toggle = (dir: string) => setOpen(o => { const n = { ...o, [dir]: !o[dir] }; if (!n[dir]) delete n[dir]; else if (!lists[dir]) void load(dir); remember(n); return n; });
  const reload = (h = hidden) => { void load('', h); for (const d of Object.keys(open)) if (open[d]) void load(d, h); };
  useEffect(() => { const h = () => reload(); const t = (e: Event) => { const v = !!(e as CustomEvent<boolean>).detail; setHidden(v); reload(v); }; window.addEventListener('wf:files', h); window.addEventListener('wf:files-hidden', t); return () => { window.removeEventListener('wf:files', h); window.removeEventListener('wf:files-hidden', t); }; });
  // the menu closes on a press outside it, Escape or a scroll (the target is checked: React listens on document too)
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && menuEl.current?.contains(e.target))) setMenu(null); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  useLayoutEffect(() => { if (menu) fitMenu(menuEl.current, menu.x, menu.y); }, [menu]);
  // what the menu offers depends on the folder — the row's own, or a file's — and whether it has a vault of its own
  const openMenu = async (e: React.MouseEvent, rel: string, dir: boolean) => {
    e.preventDefault(); e.stopPropagation();
    const folder = dir ? rel : rel.split('/').slice(0, -1).join('/');
    const parent = folder.split('/').slice(0, -1).join('/'); const pl = lists[parent] && !('error' in lists[parent]) ? lists[parent] as Listing : null;
    const at = { path: rel, dir, x: e.clientX, y: e.clientY, folder, product: !!pl?.entries.find(x => x.dir && x.name === folder.split('/').pop())?.product };
    const known = lists[folder] && !('error' in lists[folder]) ? lists[folder] as Listing : null;
    if (known) { setMenu({ ...at, state: 'ready', own: known.own, vault: known.vault }); return; }
    setMenu({ ...at, state: 'loading', own: false, vault: '' });
    const l = await load(folder);
    setMenu(m => m && m.path === rel ? { ...m, state: 'ready', own: !!l?.own, vault: l?.vault ?? '' } : m);
  };
  const abs = (rel: string) => root ? (rel ? `${root.root}/${rel}` : root.root) : rel;
  const init = async (folder: string) => {
    setMenu(null); setMsg('');
    const r = await fetch('/api/products/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: abs(folder) }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not init'); return; }
    // the tree stays where the person was looking — the folder now carries the vault's mark; the new vault is one click away
    reload(); router.refresh();
    setNote({ text: `${j.existing ? 'This folder already has its knowledge' : 'Vault made'}: ${j.vault} — `, href: `/${j.slug}`, label: `open ${j.vault}` });
  };
  const copy = async (text: string) => { setMenu(null); try { await navigator.clipboard.writeText(text); } catch { setMsg(text); } };
  // one operation of the menu (op:api.workspace-files POST); the folders it touched are read again
  const op = async (body: Record<string, unknown>, touched: string[]): Promise<{ path: string } | null> => {
    setMenu(null); setMsg('');
    const r = await fetch(`/api/workspace/files?${q.replace(/&$/, '')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg(j.message ?? j.error ?? 'failed'); return null; }
    for (const d of new Set(touched)) if (d === '' || open[d]) void load(d);
    return j as { path: string };
  };
  const parentOf = (rel: string) => rel.split('/').slice(0, -1).join('/');
  const openHere = (rel: string) => { setMenu(null); if (embedded) onOpenFile?.(rel); else router.push(fileHref(product, rel)); };
  const paste = async (m: Menu) => {
    if (!clip) return; const into = m.dir ? m.path : m.folder;
    const r = await op({ op: clip.mode === 'cut' ? 'move' : 'copy', path: clip.path, into }, [into, parentOf(clip.path)]);
    if (r && clip.mode === 'cut') setClip(null);
  };
  const remove = async (m: Menu) => {
    if (!window.confirm(`Delete "${m.path}"${m.dir ? ' and everything in it' : ''}? It goes to the trash.`)) { setMenu(null); return; }
    const r = await op({ op: 'delete', path: m.path }, [parentOf(m.path)]);
    if (r && !embedded && path === fileHref(product, m.path)) router.push(`/${product}`);
  };
  const named = async (m: Menu) => {
    const a = m.ask!; const v = a.value.trim(); if (!v) return;
    if (a.kind === 'rename') { const r = await op({ op: 'rename', path: m.path, name: v }, [parentOf(m.path)]); if (r && !m.dir && !embedded && path === fileHref(product, m.path)) router.push(fileHref(product, r.path)); return; }
    const into = m.dir ? m.path : m.folder;
    const r = await op({ op: a.kind, path: into, name: v }, [into]);
    if (r && a.kind === 'newfile') { setOpen(o => ({ ...o, [into]: true })); openHere(r.path); }
  };
  const rows = (dir: string, depth: number): React.ReactNode => {
    const l = lists[dir];
    if (!l) return <li className="ft-note" style={{ paddingLeft: 24 + depth * 16 }}>…</li>;
    if ('error' in l) return <li className="ft-note notice" style={{ paddingLeft: 24 + depth * 16 }}>{l.error}</li>;
    if (!l.entries.length) return <li className="ft-note" style={{ paddingLeft: 24 + depth * 16 }}>empty</li>;
    const q = filter.trim().toLowerCase();
    const shown = q ? l.entries.filter(e => e.dir || e.name.toLowerCase().includes(q)) : l.entries;
    return shown.map(e => {
      const rel = dir ? `${dir}/${e.name}` : e.name; const href = fileHref(product, rel);
      return (
        <li key={rel}>
          <div className={`pg-row ft-row ${!e.dir && path === href ? 'on' : ''} ${e.ignored ? 'ft-ignored' : ''} ${clip?.mode === 'cut' && clip.path === rel ? 'ft-cut' : ''}`} style={{ paddingLeft: 10 + depth * 16 }} onContextMenu={ev => openMenu(ev, rel, e.dir)} title={rel}>
            {e.dir
              ? <button className="ft-dir" onClick={() => toggle(rel)} aria-expanded={!!open[rel]}><span className="pg-caret" aria-hidden>{open[rel] ? '▾' : '▸'}</span>{e.vault && <VaultMark />}<span className="pg-title">{e.name}</span></button>
              : embedded
                ? <button className="ft-dir ft-file" onClick={() => onOpenFile?.(rel)}><span className="pg-dot" aria-hidden /><span className="pg-title">{e.name}</span></button>
                : <Link href={href} className="pg-link ft-file" draggable={false}><span className="pg-dot" aria-hidden /><span className="pg-title">{e.name}</span></Link>}
          </div>
          {e.dir && open[rel] && <ul>{rows(rel, depth + 1)}</ul>}
        </li>
      );
    });
  };
  if (lists[''] && 'error' in lists['']) return bare ? <p className="ft-note" style={{ padding: '4px 16px' }}>{(lists[''] as { error: string }).error}</p> : null; // no folder to show
  return (
    <div className={`ft-wrap ${bare ? 'ft-bare' : ''}`}>
      {bare ? <div className="ft-root-row" onContextMenu={ev => openMenu(ev, '', true)} title={root?.root}>{root?.own && <VaultMark />}{root?.name ?? '…'}</div> : <div className="rail-pages-head ft-head" onContextMenu={ev => openMenu(ev, '', true)}>
        <span title={root?.root}>Files{root ? <span className="ft-root"> · {root.name}</span> : null}</span>
        <span className="rail-pages-tools">
          <button className={hidden ? 'on' : ''} onClick={() => { const h = !hidden; setHidden(h); reload(h); }} title={hidden ? 'Hide what git ignores and build folders' : 'Show ignored files too (node_modules, build output, .wye)'} aria-pressed={hidden} aria-label="Show ignored files"><IconEye /></button>
          <button onClick={() => reload()} title="Read the folder again" aria-label="Reload files"><IconRefresh /></button>
        </span>
      </div>}
      {msg && <p className="notice pg-msg ft-msg" role="alert">{msg} <button className="linkish" onClick={() => setMsg('')}>×</button></p>}
      {note && <p className="pg-msg ft-msg ft-note-ok" role="status">{note.text}<Link href={note.href}>{note.label}</Link> <button className="linkish" onClick={() => setNote(null)}>×</button></p>}
      <ul className="pg-tree ft-tree">{rows('', 0)}</ul>
      {menu && menu.ask && <div ref={menuEl} className="pg-menu pg-rename" style={{ left: menu.x, top: menu.y }}>
        <input autoFocus aria-label={menu.ask.kind === 'rename' ? 'New name' : menu.ask.kind === 'mkdir' ? 'Folder name' : 'File name'} value={menu.ask.value} placeholder={menu.ask.kind === 'rename' ? 'Name, then Enter' : menu.ask.kind === 'mkdir' ? 'New folder, then Enter' : 'New file, then Enter'} onFocus={e => { const i = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, menu.ask!.kind === 'rename' && i > 0 ? i : e.target.value.length); }}
          onChange={e => setMenu({ ...menu, ask: { ...menu.ask!, value: e.target.value } })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void named(menu); } }} />
      </div>}
      {menu && !menu.ask && <div ref={menuEl} className="pg-menu ft-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
        {!menu.dir && <>
          <button role="menuitem" onClick={() => openHere(menu.path)}>Open</button>
          {peek && !embedded && <button role="menuitem" onClick={() => { const p = menu.path; setMenu(null); peek.open(`wsfile:${p}`); }}>Open in the context column</button>}
          <button role="menuitem" onClick={() => op({ op: 'open', path: menu.path }, [])}>Open in its application</button>
        </>}
        <button role="menuitem" onClick={() => op({ op: 'reveal', path: menu.path }, [])}>Reveal in {typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'Finder' : 'the file browser'}</button>
        <hr />
        {menu.path && <><button role="menuitem" onClick={() => { setClip({ path: menu.path, mode: 'cut' }); setMenu(null); }}>Cut</button>
        <button role="menuitem" onClick={() => { setClip({ path: menu.path, mode: 'copy' }); setMenu(null); }}>Copy</button></>}
        <button role="menuitem" disabled={!clip} onClick={() => paste(menu)} title={clip ? `${clip.mode === 'cut' ? 'Move' : 'Copy'} ${clip.path} into ${(menu.dir ? menu.path : menu.folder) || 'the root'}` : 'Nothing was cut or copied'}>Paste{clip ? ` (${clip.path.split('/').pop()})` : ''}</button>
        <hr />
        <button role="menuitem" onClick={() => copy(abs(menu.path))}>Copy path</button>
        <button role="menuitem" onClick={() => copy(menu.path || '.')}>Copy relative path</button>
        <hr />
        {menu.path && <><button role="menuitem" onClick={() => setMenu({ ...menu, ask: { kind: 'rename', value: menu.path.split('/').pop() ?? '' } })}>Rename…</button>
        <button role="menuitem" className="danger" onClick={() => remove(menu)}>Delete</button>
        <hr /></>}
        <button role="menuitem" onClick={() => setMenu({ ...menu, ask: { kind: 'newfile', value: '' } })}>New file{menu.dir ? '' : ' here'}…</button>
        <button role="menuitem" onClick={() => setMenu({ ...menu, ask: { kind: 'mkdir', value: '' } })}>New folder{menu.dir ? '' : ' here'}…</button>
        <hr />
        {menu.state === 'loading' ? <button disabled>…</button> : menu.own
          ? <button role="menuitem" disabled={!menu.vault} onClick={() => { const v = menu.vault; setMenu(null); router.push(`/${v}`); }} title={menu.vault ? undefined : 'This vault is not one the app has open'}>Reveal in Documents</button>
          : menu.product ? <button role="menuitem" disabled title="This folder is a product's own folder (_product.md and projects/ in it) — it is already knowledge, not code to read">Already a product</button>
          : <button role="menuitem" onClick={() => init(menu.folder)} title={`A vault for ${menu.folder || 'this folder'}: its own knowledge in .wye/, read from the code`}>Init Wye here{!menu.dir && menu.folder ? ` (${menu.folder.split('/').pop()}/)` : ''}</button>}
      </div>}
    </div>
  );
}

// the mark of a folder that has its own vault — Wye's Y, the way the rail's own mark is drawn
function VaultMark() {
  return <span className="ft-vault" title="This folder has its own knowledge — a Wye vault">Y</span>;
}
