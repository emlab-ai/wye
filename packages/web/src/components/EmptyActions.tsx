'use client';
import type { ReactNode } from 'react';
import { requestSend } from './CommandBox';
import { open } from './Help';

// The buttons of the empty states (components/EmptyState): a server page passes one of these as `actions`. Each opens
// what fills the page through the app's own openers (Help's `open`): the command box in Remember or PR mode, the
// rail's New page sheet (on Import when asked), the search panel; `agent` opens the box on an ad-hoc conversation.
export type EmptyAct = 'remember' | 'pr' | 'new-page' | 'import' | 'search' | 'help' | 'agent';
const run: Record<EmptyAct, () => void> = {
  remember: open.remember, pr: open.pr, search: open.search, help: open.help,
  'new-page': () => open.newPage(), import: () => open.newPage(true),
  agent: () => requestSend({ mode: 'adhoc' }),
};

export function EmptyAction({ act, pri, children }: { act: EmptyAct; pri?: boolean; children: ReactNode }) {
  return <button type="button" className={pri ? 'pri' : undefined} onClick={run[act]}>{children}</button>;
}
