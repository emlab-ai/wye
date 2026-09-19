'use client';
import { useEffect, useRef, type ReactNode } from 'react';

// A strip of tabs, editor style (req:wf2.ui.tabs): one row that scrolls sideways, the open tab on the content's
// ground, the others sunk; × closes (the middle button too), a pinned tab keeps its place and shows a pin instead
// of ×. The same strip sits above the content and above the context column, so both read the same way.
export type Tab = { key: string; label: string; icon?: ReactNode; title?: string; pinned?: boolean; fixed?: boolean }; // fixed: no close, no pin
export function TabStrip({ tabs, active, onPick, onClose, onPin, before, after, label }: {
  tabs: Tab[]; active: string | null; onPick: (key: string) => void; onClose?: (key: string) => void; onPin?: (key: string) => void;
  before?: ReactNode; after?: ReactNode; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the open tab stays in view when it changes or a tab is added
  useEffect(() => { ref.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active, tabs.length]);
  return (
    <div className="tabstrip">
      {before}
      <div className="tabs" ref={ref} role="tablist" aria-label={label} onWheel={e => { if (e.deltaY && !e.deltaX) e.currentTarget.scrollLeft += e.deltaY; }}>
        {tabs.map(t => (
          <div key={t.key} role="tab" tabIndex={0} aria-selected={t.key === active} className={`tab ${t.key === active ? 'on' : ''} ${t.pinned ? 'pinned' : ''}`} title={t.title ?? t.label}
            onClick={() => onPick(t.key)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(t.key); } }}
            onAuxClick={e => { if (e.button === 1 && onClose && !t.pinned) { e.preventDefault(); onClose(t.key); } }}>
            {t.icon && <span className="tab-icon">{t.icon}</span>}
            <span className="tab-label">{t.label}</span>
            {onPin && !t.pinned && !t.fixed && <button type="button" className="tab-pin" onClick={e => { e.stopPropagation(); onPin(t.key); }} title="Pin: keep this tab" aria-label="Pin">⚲</button>}
            {t.pinned
              ? <button type="button" className="tab-pin pinned" onClick={e => { e.stopPropagation(); onPin?.(t.key); }} title="Pinned — click to unpin" aria-label="Unpin">⚲</button>
              : onClose && !t.fixed && <button type="button" className="tab-x" onClick={e => { e.stopPropagation(); onClose(t.key); }} title="Close" aria-label="Close">×</button>}
          </div>
        ))}
      </div>
      {after}
    </div>
  );
}
