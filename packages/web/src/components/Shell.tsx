'use client';
import type { ReactNode } from 'react';
import { usePeek } from './PeekProvider';
import { PeekPanel } from './PeekPanel';
import { SendToAgentHost } from './SendToAgent';

// The app frame: rail, content, and — while a node is open — a third column with its panel (split screen).
export function Shell({ children }: { children: ReactNode }) {
  const { openId, showContext, stack } = usePeek();
  return <div className={`shell ${openId || showContext || stack.length ? 'split' : ''}`}>{children}<PeekPanel /><SendToAgentHost /></div>;
}
