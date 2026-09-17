'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { PeekPanel } from './PeekPanel';
import { SendToAgentHost } from './SendToAgent';

// The app frame: a collapsible rail, the content, and — while a node, context or session is open — the right
// column, separated from the content by a draggable splitter. The rail starts hidden on document and session
// pages (working views) and open elsewhere; the choice and the splitter position are remembered per browser.
const MIN_PANEL = 320, MIN_CONTENT = 360;
const LayoutCtx = createContext<{ rail: boolean; toggleRail: () => void }>({ rail: true, toggleRail: () => {} });
export const useLayout = () => useContext(LayoutCtx);
export function Shell({ children }: { children: ReactNode }) {
  const { openId, showContext, stack } = usePeek();
  const path = usePathname();
  const working = /\/d\/[^/]+|\/sessions/.test(path);
  const [railOpen, setRailOpen] = useState<boolean | null>(null);
  const [panelW, setPanelW] = useState<number>(560);
  const split = !!(openId || showContext || stack.length);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => { try { const v = localStorage.getItem('wf-rail'); setRailOpen(v === null ? !working : v === '1'); const w = Number(localStorage.getItem('wf-panel-w')); if (w) setPanelW(w); } catch { setRailOpen(!working); } }, [working]);
  const toggleRail = useCallback(() => setRailOpen(o => { const n = !o; try { localStorage.setItem('wf-rail', n ? '1' : '0'); } catch { /* ignore */ } return n; }), []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleRail(); } }; const t = () => toggleRail(); window.addEventListener('keydown', h); window.addEventListener('wf:rail', t); return () => { window.removeEventListener('keydown', h); window.removeEventListener('wf:rail', t); }; }, [toggleRail]);
  // the panel may take everything but the rail and a minimum of content
  const clamp = useCallback((w: number) => { const total = frame.current?.getBoundingClientRect().width ?? window.innerWidth; const railPx = document.querySelector('.rail')?.getBoundingClientRect().width ?? 0; return Math.max(MIN_PANEL, Math.min(w, total - railPx - MIN_CONTENT)); }, []);
  useEffect(() => { const fit = () => setPanelW(w => clamp(w)); fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, [clamp, railOpen, split]);
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true; document.body.classList.add('resizing');
    const move = (ev: MouseEvent) => { if (!dragging.current || !frame.current) return; const r = frame.current.getBoundingClientRect(); setPanelW(clamp(r.right - ev.clientX)); };
    const up = () => { dragging.current = false; document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setPanelW(w => { try { localStorage.setItem('wf-panel-w', String(Math.round(w))); } catch { /* ignore */ } return w; }); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const rail = railOpen ?? !working;
  return (
    <div ref={frame} className={`shell ${split ? 'split' : ''} ${rail ? '' : 'rail-hidden'}`} style={split ? ({ '--panel-w': `${panelW}px` } as React.CSSProperties) : undefined}>
      <LayoutCtx.Provider value={{ rail, toggleRail }}>{children}</LayoutCtx.Provider>
      {split && <div className="splitter" onMouseDown={onDown} role="separator" aria-orientation="vertical" title="Drag to resize" />}
      <PeekPanel />
      <SendToAgentHost />
    </div>
  );
}
