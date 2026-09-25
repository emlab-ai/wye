'use client';
import { setKinds, KINDS } from '@/lib/ids';
import { useRef, createContext, useCallback, useContext, useEffect, useState, type ReactNode, useMemo } from 'react';
import type { IndexEntry } from '@/lib/doc';
import { docRoute } from '@/lib/doc';

// What the editor is working on right now: the current block's text, the ids it already links, and a function that
// inserts a tag at the cursor. The panel's Context mode searches the product's knowledge for it.
export type EditingContext = {
  docSlug: string; blockId: string; text: string; linked: string[]; nodeId?: string;
  // the words under the selection, and what attaches a node to them (decision:wf2.a-link-is-on-the-words): the panel
  // searches for the selection when there is one and links it in place, so a link always sits on something a reader
  // can see. `insert` drops a tag at the cursor — the old way, kept for the places that have no selection to speak of.
  selection: string; attach: (id: string) => void; insert: (id: string) => void;
  // a node made from the selected words and linked to them in one go: the words are its title
  make: (kind: string) => Promise<string | null>;
  // a comment on the selected words (decision:wf2.a-comment-can-sit-on-words): the comment is a node on this page and
  // the words link to it, so the text carries its own mark and the comment shows when the words are selected
  comment: (text: string) => Promise<string | null>;
};
// The right column is a navigation stack: the root is Context (on document pages) and every opened node is pushed
// on top. `back` pops; `go(i)` jumps to an entry, dropping what is above it — except pinned entries, which are kept.
export type StackEntry = { id: string; pinned: boolean };
// A product's own type as the editor needs it: its slug and the properties a table of it shows (own and inherited,
// the root type's left out).
export type OwnType = { slug: string; plural?: string; nestsIn?: string[]; cols: { name: string; type: string; enum: string[] | null; ref: string | null; required: boolean }[] };
interface Ctx {
  product: string; index: Record<string, IndexEntry>;
  openId: string | null; stack: StackEntry[]; cursor: number;
  open: (id: string) => void; back: () => void; go: (i: number) => void; togglePin: (i: number) => void; remove: (i: number) => void; close: () => void;
  // the node a click on a block selected (rule:block-select): the Context root shows it ahead of the caret's block
  focused: string | null; select: (id: string) => void; setFocused: (id: string | null) => void; followCaret: () => void;
  hrefFor: (id: string) => string | null;
  ownKinds: string[]; // the product's own types (type: cards), beyond the base kinds, nested ones left out
  // kind → the kinds it may sit under (decision:ontology.a-type-can-be-nested-only): `nests['when'] = ['req', …]`.
  // A kind in here is never offered where a node is made from nothing, only under a node of a kind it nests in.
  nests: Record<string, string[]>;
  ownTypes: OwnType[]; // the same types with their table columns
  editing: EditingContext | null; setEditing: (e: EditingContext | null) => void; showContext: boolean; setShowContext: (v: boolean) => void;
  panelOpen: boolean; setPanelOpen: (v: boolean) => void;
  // Related (the knowledge nearest to the block) is closed until asked for; remembered per browser (rule:related-collapsed)
  relatedOpen: boolean; setRelatedOpen: (v: boolean) => void;
}
const PeekCtx = createContext<Ctx | null>(null);

export function PeekProvider({ product, index: indexProp, kinds, types, nests: nestsProp, children }: { product: string; index: Record<string, IndexEntry> | null; kinds?: string[]; types?: OwnType[]; nests?: Record<string, string[]>; children: ReactNode }) {
  // the product's open kind list (its type: cards) so tags, node lines and the editor recognise person:ana as an id
  setKinds(kinds);
  // the node index (decision:wf2.parse-cache): the full page load carries it in the HTML; a refresh or a client
  // navigation does not (null) — it is fetched once here and again whenever the graph changes, so the server's
  // re-renders stay small
  const [index, setIndex] = useState<Record<string, IndexEntry>>(indexProp ?? {});
  const stampRef = useRef('');
  useEffect(() => {
    let live = true; let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => { try { const r = await fetch(`/api/${product}/index`, { headers: stampRef.current ? { 'if-none-match': stampRef.current } : {} }); if (r.status === 304 || !r.ok || !live) return; stampRef.current = r.headers.get('etag') ?? ''; const j = await r.json(); if (live && j.index) setIndex(j.index); } catch { /* keep what we have */ } };
    if (!indexProp) load();
    const onChange = (e: Event) => { const d = (e as CustomEvent<{ kinds: string[] }>).detail; if (!d.kinds.includes('graph')) return; if (timer) clearTimeout(timer); timer = setTimeout(load, 900); };
    window.addEventListener('wf:change', onChange);
    return () => { live = false; window.removeEventListener('wf:change', onChange); if (timer) clearTimeout(timer); };
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const nests = useMemo(() => nestsProp ?? {}, [nestsProp]);
  const ownKinds = useMemo(() => (kinds ?? []).filter(k => !(KINDS as readonly string[]).includes(k) && !(nestsProp ?? {})[k]), [kinds, nestsProp]);
  // a type that may only nest is not something a page or a node is made from (decision:ontology.a-type-can-be-nested-only)
  const ownTypes = useMemo(() => (types ?? []).filter(t => !t.nestsIn?.length), [types]);
  // One state object so pushes, pops and pins stay consistent: `cursor` indexes `stack`; -1 is the Context root.
  const [nav, setNav] = useState<{ stack: StackEntry[]; cursor: number }>({ stack: [], cursor: -1 });
  const { stack, cursor } = nav;
  // the column's tabs survive a reload, per product in this browser (req:wf2.ui.tabs); the last one is open again
  const navKey = `wf-peek:${product}`;
  const [navLoaded, setNavLoaded] = useState(false);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(navKey) ?? 'null'); if (Array.isArray(v)) { const st = v.filter((e: StackEntry) => e && typeof e.id === 'string' && index[e.id]).map((e: StackEntry) => ({ id: e.id, pinned: !!e.pinned })); setNav({ stack: st, cursor: st.length - 1 }); } } catch { /* ignore */ } setNavLoaded(true); }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (navLoaded) { try { localStorage.setItem(navKey, JSON.stringify(stack)); } catch { /* ignore */ } } }, [stack, navKey, navLoaded]);
  const [editing, setEditing] = useState<EditingContext | null>(null);
  const [showContext, setShowContext] = useState(false);
  // the right column can be hidden altogether; opening a node brings it back. Remembered per browser.
  const [panelOpen, setPanelOpenState] = useState(true);
  useEffect(() => { try { setPanelOpenState(localStorage.getItem('wf-panel') !== '0'); } catch { /* ignore */ } }, []);
  const setPanelOpen = useCallback((v: boolean) => { setPanelOpenState(v); try { localStorage.setItem('wf-panel', v ? '1' : '0'); } catch { /* ignore */ } }, []);
  const [relatedOpen, setRelatedOpenState] = useState(false);
  useEffect(() => { try { setRelatedOpenState(localStorage.getItem('wf-related') === '1'); } catch { /* ignore */ } }, []);
  const setRelatedOpen = useCallback((v: boolean) => { setRelatedOpenState(v); try { localStorage.setItem('wf-related', v ? '1' : '0'); } catch { /* ignore */ } }, []);
  const openId = cursor >= 0 ? stack[cursor]?.id ?? null : null;
  // Opening is a tab (req:wf2.ui.tabs): the node's tab when it is open already, else a new tab right after the
  // current one — nothing is dropped, so what was read before stays one click away (rule:block-select).
  const open = useCallback((id: string) => { if (id) setPanelOpen(true); setNav(n => {
    if (!id) return { ...n, cursor: -1 };
    const existing = n.stack.findIndex(e => e.id === id);
    if (existing >= 0) return { stack: n.stack, cursor: existing };
    const at = n.cursor < 0 ? n.stack.length : n.cursor + 1;
    return { stack: [...n.stack.slice(0, at), { id, pinned: false }, ...n.stack.slice(at)], cursor: at };
  }); }, [setPanelOpen]);
  // Selecting a block (a click anywhere on it) is not navigation: nothing is pushed, the column comes back to its
  // Context root and shows the node; the chips stay so what was open is one click away.
  const [focused, setFocused] = useState<string | null>(null);
  const select = useCallback((id: string) => { if (!id) return; setFocused(id); setPanelOpen(true); setNav(n => ({ ...n, cursor: -1 })); }, [setPanelOpen]);
  // the caret moved to another block: back to the Context root, which shows the block under the caret; nothing pushed, nothing popped
  const followCaret = useCallback(() => setNav(n => (n.cursor === -1 ? n : { ...n, cursor: -1 })), []);
  const back = useCallback(() => setNav(n => ({ ...n, cursor: Math.max(-1, n.cursor - 1) })), []);
  const go = useCallback((i: number) => setNav(n => ({ ...n, cursor: Math.min(i, n.stack.length - 1) })), []);
  const togglePin = useCallback((i: number) => setNav(n => ({ ...n, stack: n.stack.map((e, k) => k === i ? { ...e, pinned: !e.pinned } : e) })), []);
  const remove = useCallback((i: number) => setNav(n => { const stack = n.stack.filter((_, k) => k !== i); const cursor = n.cursor === i ? Math.min(i, stack.length - 1) : n.cursor > i ? n.cursor - 1 : n.cursor; return { stack, cursor }; }), []);
  // Close: back to the Context root; the tabs stay (the column's × hides the column, its tabs with it).
  const close = useCallback(() => setNav(n => ({ ...n, cursor: -1 })), []);
  // a document's node opens the document itself (whatever the node's kind, rule:page-node-line); any other node its anchor
  const hrefFor = useCallback((id: string) => { const e = index[id]; const r = e?.file ? docRoute(e.file) : null; if (!r) return null; return e.doc ? `/${product}/${r.project}/d/${e.doc}` : `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(id)}`; }, [index, product]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [back]);
  return <PeekCtx.Provider value={{ product, index, ownKinds, ownTypes, nests, openId, stack, cursor, open, back, go, togglePin, remove, close, focused, select, setFocused, followCaret, hrefFor, editing, setEditing, showContext, setShowContext, panelOpen, setPanelOpen, relatedOpen, setRelatedOpen }}>{children}</PeekCtx.Provider>;
}
export function usePeek(): Ctx { const c = useContext(PeekCtx); if (!c) throw new Error('PeekProvider missing'); return c; }
