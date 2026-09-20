'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { PeekPanel } from './PeekPanel';
import { CommandBox } from './CommandBox';
import { SearchPanel } from './SearchPanel';
import { QuestionToasts } from './QuestionToasts';

// The app frame: a collapsible rail, the content, and — while a node, context or session is open — the right
// column, separated from the content by a draggable splitter. The rail starts hidden on document and session
// pages (working views) and open elsewhere; the choice and the splitter position are remembered per browser.
const MIN_PANEL = 320, MIN_CONTENT = 360, MIN_RAIL = 200, MAX_RAIL = 640, RAIL_W = 280;
const LayoutCtx = createContext<{ rail: boolean; toggleRail: () => void; panel: boolean; togglePanel: () => void }>({ rail: true, toggleRail: () => {}, panel: true, togglePanel: () => {} });
export const useLayout = () => useContext(LayoutCtx);
export function Shell({ children }: { children: ReactNode }) {
  const { openId, showContext, stack, panelOpen, setPanelOpen } = usePeek();
  const path = usePathname();
  const working = /\/d\/[^/]+|\/sessions/.test(path);
  const [railOpen, setRailOpen] = useState<boolean | null>(null);
  const [panelW, setPanelW] = useState<number>(560);
  // the rail's width: a splitter on its right edge, remembered per browser, double-click resets (req:wf2.ui.rail-resize)
  const [railW, setRailW] = useState<number>(RAIL_W);
  const [search, setSearch] = useState(false);
  const split = panelOpen && !!(openId || showContext || stack.length);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => { try { const v = localStorage.getItem('wf-rail'); setRailOpen(v === null ? !working : v === '1'); const w = Number(localStorage.getItem('wf-panel-w')); if (w) setPanelW(w); const rw = Number(localStorage.getItem('wf-rail-w')); if (rw) setRailW(Math.min(MAX_RAIL, Math.max(MIN_RAIL, rw))); } catch { setRailOpen(!working); } }, [working]);
  const toggleRail = useCallback(() => setRailOpen(o => { const n = !o; try { localStorage.setItem('wf-rail', n ? '1' : '0'); } catch { /* ignore */ } return n; }), []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleRail(); } if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.altKey) { e.preventDefault(); setSearch(true); } if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); setPanelOpen(!panelOpen); } }; const t = () => toggleRail(); window.addEventListener('keydown', h); window.addEventListener('wf:rail', t); return () => { window.removeEventListener('keydown', h); window.removeEventListener('wf:rail', t); }; }, [toggleRail, panelOpen, setPanelOpen]);
  // the panel may take everything but the rail and a minimum of content
  const clamp = useCallback((w: number) => { const total = frame.current?.getBoundingClientRect().width ?? window.innerWidth; const railPx = document.querySelector('.rail')?.getBoundingClientRect().width ?? 0; return Math.max(MIN_PANEL, Math.min(w, total - railPx - MIN_CONTENT)); }, []);
  useEffect(() => { const fit = () => setPanelW(w => clamp(w)); fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, [clamp, railOpen, split, railW]);
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true; document.body.classList.add('resizing');
    const move = (ev: MouseEvent) => { if (!dragging.current || !frame.current) return; const r = frame.current.getBoundingClientRect(); setPanelW(clamp(r.right - ev.clientX)); };
    const up = () => { dragging.current = false; document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setPanelW(w => { try { localStorage.setItem('wf-panel-w', String(Math.round(w))); } catch { /* ignore */ } return w; }); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const onRailDown = (e: React.MouseEvent) => {
    e.preventDefault(); document.body.classList.add('resizing');
    const move = (ev: MouseEvent) => { const left = frame.current?.getBoundingClientRect().left ?? 0; setRailW(Math.min(MAX_RAIL, Math.max(MIN_RAIL, ev.clientX - left))); };
    const up = () => { document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setRailW(w => { try { localStorage.setItem('wf-rail-w', String(Math.round(w))); } catch { /* ignore */ } return w; }); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const resetRail = () => { setRailW(RAIL_W); try { localStorage.removeItem('wf-rail-w'); } catch { /* ignore */ } };
  const rail = railOpen ?? !working;
  return (
    <div ref={frame} className={`shell ${split ? 'split' : ''} ${rail ? '' : 'rail-hidden'}`} style={{ '--rail-w': `${railW}px`, ...(split ? { '--panel-w': `${panelW}px` } : {}) } as React.CSSProperties}>
      <LayoutCtx.Provider value={{ rail, toggleRail, panel: panelOpen, togglePanel: () => setPanelOpen(!panelOpen) }}>{children}</LayoutCtx.Provider>
      {rail && <div className="rail-resize" onMouseDown={onRailDown} onDoubleClick={resetRail} role="separator" aria-orientation="vertical" title="Drag to resize the rail; double-click to reset" />}
      {split && <div className="splitter" onMouseDown={onDown} role="separator" aria-orientation="vertical" title="Drag to resize" />}
      {split && <PeekPanel />}
      <CommandBox />
      <SearchPanel open={search} onClose={() => setSearch(false)} />
      <QuestionToasts />
    </div>
  );
}
