import { describe, it, expect } from 'vitest';
import { dedupeUserEvents } from './transcript';
import type { ChatEvent } from './session-types';

const u = (t: string, text: string, extra: Partial<ChatEvent> = {}): ChatEvent => ({ t, kind: 'user', text, ...extra });
const r = (t: string): ChatEvent => ({ t, kind: 'result', text: '' });

describe('dedupeUserEvents', () => {
  it('drops a user event that repeats the previous one within the same turn', () => {
    const tail = [u('2026-09-17T19:25:01Z', 'hello', { images: ['a.png'] })];
    expect(dedupeUserEvents(tail, [u('2026-09-17T19:25:07Z', 'hello')])).toEqual([]);
  });
  it('keeps the same text sent again after the turn ended', () => {
    const tail = [u('2026-09-17T19:25:01Z', 'ok'), r('2026-09-17T19:25:05Z')];
    expect(dedupeUserEvents(tail, [u('2026-09-17T19:25:09Z', 'ok')])).toHaveLength(1);
  });
  it('dedupes within the batch being appended too, and leaves other kinds alone', () => {
    const batch: ChatEvent[] = [u('1', 'x'), { t: '2', kind: 'tool_use', name: 'Bash' }, u('3', 'x'), { t: '4', kind: 'assistant', text: 'x' }];
    expect(dedupeUserEvents([], batch).map(e => e.kind)).toEqual(['user', 'tool_use', 'assistant']);
  });
});
