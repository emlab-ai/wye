'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { IndexEntry } from '@/lib/doc';
import { docRoute } from '@/lib/doc';

// What the editor is working on right now: the current block's text, the ids it already links, and a function that
// inserts a tag at the cursor. The panel's Context mode searches the product's knowledge for it.
export type EditingContext = { docSlug: string; blockId: string; text: string; linked: string[]; insert: (id: string) => void };
interface Ctx { product: string; index: Record<string, IndexEntry>; openId: string | null; open: (id: string) => void; close: () => void; hrefFor: (id: string) => string | null; editing: EditingContext | null; setEditing: (e: EditingContext | null) => void; showContext: boolean; setShowContext: (v: boolean) => void }
const PeekCtx = createContext<Ctx | null>(null);

export function PeekProvider({ product, index, children }: { product: string; index: Record<string, IndexEntry>; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingContext | null>(null);
  const [showContext, setShowContext] = useState(false);
  const open = useCallback((id: string) => { setOpenId(id || null); if (id) setShowContext(false); }, []);
  const close = useCallback(() => { setOpenId(null); setShowContext(false); }, []);
  const hrefFor = useCallback((id: string) => { const e = index[id]; const r = e?.file ? docRoute(e.file) : null; return r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(id)}` : null; }, [index, product]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [close]);
  return <PeekCtx.Provider value={{ product, index, openId, open, close, hrefFor, editing, setEditing, showContext, setShowContext }}>{children}</PeekCtx.Provider>;
}
export function usePeek(): Ctx { const c = useContext(PeekCtx); if (!c) throw new Error('PeekProvider missing'); return c; }
