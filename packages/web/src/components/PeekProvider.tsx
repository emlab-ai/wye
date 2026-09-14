'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { IndexEntry } from '@/lib/doc';
import { PeekPanel } from './PeekPanel';

interface Ctx { project: string; index: Record<string, IndexEntry>; openId: string | null; open: (id: string) => void; close: () => void }
const PeekCtx = createContext<Ctx | null>(null);

export function PeekProvider({ project, index, children }: { project: string; index: Record<string, IndexEntry>; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [close]);
  return <PeekCtx.Provider value={{ project, index, openId, open, close }}>{children}<PeekPanel /></PeekCtx.Provider>;
}
export function usePeek(): Ctx { const c = useContext(PeekCtx); if (!c) throw new Error('PeekProvider missing'); return c; }
