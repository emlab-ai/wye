import type { ChatEvent } from './session-types';

// A turn has one user message (a batch is joined into one), so a user event that repeats the previous user event's
// text before the turn ended is a replay, not a message — the host once emitted one for Claude's
// --replay-user-messages echo on top of its own (task:duplicate-user-event). Dropped when appending.
export function dedupeUserEvents(tail: ChatEvent[], batch: ChatEvent[]): ChatEvent[] {
  let lastUser: string | null = null;
  for (const e of tail) { if (e.kind === 'user') lastUser = e.text ?? ''; else if (e.kind === 'result' || e.kind === 'exit') lastUser = null; }
  const out: ChatEvent[] = [];
  for (const e of batch) {
    if (e.kind === 'user') { if (lastUser !== null && (e.text ?? '') === lastUser) continue; lastUser = e.text ?? ''; }
    else if (e.kind === 'result' || e.kind === 'exit') lastUser = null;
    out.push(e);
  }
  return out;
}

// The `user` event for a conversation's first message (req:wf2.console.first-message-is-the-request): `text` is
// what the person asked — the instruction, or the batch text — and `prompt` the whole message the agent received
// when the Waterfall wrapper (product line, Context, plan-first, How to work) adds to it. Equal texts carry no prompt.
export function firstUserEvent(prompt: string, shown: string, images: string[] = []): Omit<ChatEvent, 't'> {
  const text = shown.trim() || prompt;
  return text === prompt ? { kind: 'user', text, images } : { kind: 'user', text, prompt, images };
}
