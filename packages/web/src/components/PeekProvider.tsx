'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { IndexEntry } from '@/lib/doc';
import { docRoute } from '@/lib/doc';
import { PeekPanel } from './PeekPanel';

interface Ctx { product: string; index: Record<string, IndexEntry>; openId: string | null; open: (id: string) => void; close: () => void; hrefFor: (id: string) => string | null }
const PeekCtx = createContext<Ctx | null>(null);

export function PeekProvider({ product, index, children }: { product: string; index: Record<string, IndexEntry>; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);
  const hrefFor = useCallback((id: string) => { const e = index[id]; const r = e?.file ? docRoute(e.file) : null; return r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(id)}` : null; }, [index, product]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [close]);
  return <PeekCtx.Provider value={{ product, index, openId, open, close, hrefFor }}>{children}<PeekPanel /></PeekCtx.Provider>;
}
export function usePeek(): Ctx { const c = useContext(PeekCtx); if (!c) throw new Error('PeekProvider missing'); return c; }
