// The sessions on a PR (decision:wf2.pr-approval-is-the-persons-click): when the person approves or cancels, the
// live refining session on it is told once and stopped. Kept apart from lib/pr-docs so that module stays free of the
// agent host (which imports it).
import { listSessions } from './sessions';
import { isLive, sendMessage, stopChat } from './agent-host';

// returns the ids stopped
export async function stopRefining(productDir: string, ref: string, text: string): Promise<string[]> {
  const stopped: string[] = [];
  for (const s of await listSessions(productDir)) {
    if (s.role !== 'librarian' || s.prDoc !== ref || !isLive(s.id)) continue;
    try { await sendMessage(productDir, s.id, { text }); } catch { /* the stop follows anyway */ }
    stopChat(s.id, 'stopped — the PR was approved or cancelled'); stopped.push(s.id);
  }
  return stopped;
}
