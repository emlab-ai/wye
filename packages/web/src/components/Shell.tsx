'use client';
import type { ReactNode } from 'react';
import { usePeek } from './PeekProvider';
import { PeekPanel } from './PeekPanel';

// The app frame: rail, content, and — while a node is open — a third column with its panel (split screen).
export function Shell({ children }: { children: ReactNode }) {
  const { openId } = usePeek();
  return <div className={`shell ${openId ? 'split' : ''}`}>{children}<PeekPanel /></div>;
}
