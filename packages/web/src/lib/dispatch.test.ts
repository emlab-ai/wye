import { describe, it, expect } from 'vitest';
import { pickNext } from './dispatch';

// the dispatcher's choice (decision:wf2.pr-scheduler): approval order, overlap skips without blocking, slots
describe('pickNext', () => {
  const a = { ref: 'w/p/pr-1', num: 1, approvedAt: '2026-09-20T10:00Z', scope: ['req:a', 'rule:x'] };
  const b = { ref: 'w/p/pr-2', num: 2, approvedAt: '2026-09-20T09:00Z', scope: ['req:b'] };
  const c = { ref: 'w/p/pr-3', num: 3, approvedAt: '2026-09-20T11:00Z', scope: ['req:c'] };
  it('starts in approval order up to the free slots', () => {
    expect(pickNext([a, b, c], [], 2)).toEqual({ start: ['w/p/pr-2', 'w/p/pr-1'], waiting: { 'w/p/pr-3': 'no free slot (2 building)' } });
  });
  it('an overlap waits and names the clash; the next one is not held back', () => {
    const r = pickNext([a, b, c], [{ ref: 'w/p/pr-9', num: 9, scope: ['rule:x'] }], 1);
    expect(r.start).toEqual(['w/p/pr-2']);
    expect(r.waiting['w/p/pr-1']).toBe('overlaps #9 (rule:x)');
    expect(r.waiting['w/p/pr-3']).toBe('no free slot (2 building)');
  });
  it('two approved PRs that overlap each other run one after the other', () => {
    const d = { ...c, scope: ['req:b'], approvedAt: '2026-09-20T12:00Z' };
    const r = pickNext([b, d], [], 3);
    expect(r.start).toEqual(['w/p/pr-2']); expect(r.waiting['w/p/pr-3']).toBe('overlaps #2 (req:b)');
  });
});
