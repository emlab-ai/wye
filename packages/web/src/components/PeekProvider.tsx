'use client';
import { setKinds, KINDS } from '@/lib/ids';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, useMemo } from 'react';
import type { IndexEntry } from '@/lib/doc';
import { docRoute } from '@/lib/doc';

// What the editor is working on right now: the current block's text, the ids it already links, and a function that
// inserts a tag at the cursor. The panel's Context mode searches the product's knowledge for it.
export type EditingContext = { docSlug: string; blockId: string; text: string; linked: string[]; nodeId?: string; insert: (id: string) => void };
// The right column is a navigation stack: the root is Context (on document pages) and every opened node is pushed
// on top. `back` pops; `go(i)` jumps to an entry, dropping what is above it — except pinned entries, which are kept.
export type StackEntry = { id: string; pinned: boolean };
// A product's own type as the editor needs it: its slug and the properties a table of it shows (own and inherited,
// the root type's left out).
export type OwnType = { slug: string; cols: { name: string; type: string; enum: string[] | null; ref: string | null; required: boolean }[] };
interface Ctx {
  product: string; index: Record<string, IndexEntry>;
  openId: string | null; stack: StackEntry[]; cursor: number;
  open: (id: string) => void; back: () => void; go: (i: number) => void; togglePin: (i: number) => void; remove: (i: number) => void; close: () => void;
  hrefFor: (id: string) => string | null;
  ownKinds: string[]; // the product's own types (type: cards), beyond the base kinds
  ownTypes: OwnType[]; // the same types with their table columns
  editing: EditingContext | null; setEditing: (e: EditingContext | null) => void; showContext: boolean; setShowContext: (v: boolean) => void;
  panelOpen: boolean; setPanelOpen: (v: boolean) => void;
}
const PeekCtx = createContext<Ctx | null>(null);

export function PeekProvider({ product, index, kinds, types, children }: { product: string; index: Record<string, IndexEntry>; kinds?: string[]; types?: OwnType[]; children: ReactNode }) {
  // the product's open kind list (its type: cards) so tags, node lines and the editor recognise person:ana as an id
  setKinds(kinds);
  const ownKinds = useMemo(() => (kinds ?? []).filter(k => !(KINDS as readonly string[]).includes(k)), [kinds]);
  const ownTypes = useMemo(() => types ?? [], [types]);
  // One state object so pushes, pops and pins stay consistent: `cursor` indexes `stack`; -1 is the Context root.
  const [nav, setNav] = useState<{ stack: StackEntry[]; cursor: number }>({ stack: [], cursor: -1 });
  const { stack, cursor } = nav;
  const [editing, setEditing] = useState<EditingContext | null>(null);
  const [showContext, setShowContext] = useState(false);
  // the right column can be hidden altogether; opening a node brings it back. Remembered per browser.
  const [panelOpen, setPanelOpenState] = useState(true);
  useEffect(() => { try { setPanelOpenState(localStorage.getItem('wf-panel') !== '0'); } catch { /* ignore */ } }, []);
  const setPanelOpen = useCallback((v: boolean) => { setPanelOpenState(v); try { localStorage.setItem('wf-panel', v ? '1' : '0'); } catch { /* ignore */ } }, []);
  const openId = cursor >= 0 ? stack[cursor]?.id ?? null : null;
  // Opening pushes on top of the current position; unpinned entries above it are dropped, pinned ones stay.
  const open = useCallback((id: string) => { if (id) setPanelOpen(true); setNav(n => {
    if (!id) return { ...n, cursor: -1 };
    const kept = n.stack.filter((e, i) => i <= n.cursor || e.pinned);
    const existing = kept.findIndex(e => e.id === id);
    if (existing >= 0) return { stack: kept, cursor: existing };
    return { stack: [...kept, { id, pinned: false }], cursor: kept.length };
  }); }, [setPanelOpen]);
  const back = useCallback(() => setNav(n => ({ ...n, cursor: Math.max(-1, n.cursor - 1) })), []);
  const go = useCallback((i: number) => setNav(n => ({ ...n, cursor: Math.min(i, n.stack.length - 1) })), []);
  const togglePin = useCallback((i: number) => setNav(n => ({ ...n, stack: n.stack.map((e, k) => k === i ? { ...e, pinned: !e.pinned } : e) })), []);
  const remove = useCallback((i: number) => setNav(n => ({ stack: n.stack.filter((_, k) => k !== i), cursor: n.cursor >= i ? n.cursor - 1 : n.cursor })), []);
  // Close: on document pages fall back to the Context root; elsewhere clear the column entirely.
  const close = useCallback(() => setNav(n => showContext ? { ...n, cursor: -1 } : { stack: n.stack.filter(e => e.pinned), cursor: -1 }), [showContext]);
  const hrefFor = useCallback((id: string) => { const e = index[id]; const r = e?.file ? docRoute(e.file) : null; return r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(id)}` : null; }, [index, product]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [back]);
  return <PeekCtx.Provider value={{ product, index, ownKinds, ownTypes, openId, stack, cursor, open, back, go, togglePin, remove, close, hrefFor, editing, setEditing, showContext, setShowContext, panelOpen, setPanelOpen }}>{children}</PeekCtx.Provider>;
}
export function usePeek(): Ctx { const c = useContext(PeekCtx); if (!c) throw new Error('PeekProvider missing'); return c; }
