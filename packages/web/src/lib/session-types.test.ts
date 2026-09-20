import { describe, it, expect } from 'vitest';
import { queueState, queueSummary, nextTake, queueView } from './session-types';

// decision:wf2.queue-item-state — the state of a queue item is derived from its stamps
describe('queueState', () => {
  it('follows the stamps', () => {
    expect(queueState({})).toBe('waiting');
    expect(queueState({ sentAt: 't' })).toBe('working');
    expect(queueState({ sentAt: 't', doneAt: 't' })).toBe('done');
    expect(queueState({ sentAt: 't', failedAt: 't' })).toBe('failed');
  });
  it('summarises the states that have items, working first', () => {
    expect(queueSummary([{ sentAt: 't' }, {}, {}, { sentAt: 't', doneAt: 't' }])).toBe('1 working · 2 waiting · 1 done');
    expect(queueSummary([])).toBe('');
    expect(queueSummary([{ sentAt: 't', failedAt: 't' }])).toBe('1 failed');
  });
  it('queueView keeps text and stamps, drops refs and images', () => {
    const v = queueView([{ id: 'a', text: 'x', addedAt: 't', refs: ['req:x'], images: ['i.png'], fresh: true }], undefined);
    expect(v).toEqual({ items: [{ id: 'a', text: 'x', addedAt: 't', sentAt: undefined, doneAt: undefined, failedAt: undefined, error: undefined, fresh: true, pr: undefined, state: 'waiting' }], batch: 'one' });
  });
});

// req:wf2.sessions.fresh-in-queue — a fresh item is handed alone; a batch splits at it
describe('nextTake', () => {
  const q = (id: string, extra: Partial<{ sentAt: string; fresh: boolean }> = {}) => ({ id, ...extra });
  it('one at a time takes the first pending item', () => {
    expect(nextTake([q('a', { sentAt: 't' }), q('b'), q('c')], 'one').map(x => x.id)).toEqual(['b']);
  });
  it('batch takes every pending item when none is fresh', () => {
    expect(nextTake([q('a', { sentAt: 't' }), q('b'), q('c')], 'all').map(x => x.id)).toEqual(['b', 'c']);
  });
  it('batch stops before a fresh item, then hands the fresh one alone', () => {
    expect(nextTake([q('b'), q('c'), q('d', { fresh: true }), q('e')], 'all').map(x => x.id)).toEqual(['b', 'c']);
    expect(nextTake([q('d', { fresh: true }), q('e')], 'all').map(x => x.id)).toEqual(['d']);
    expect(nextTake([q('d', { fresh: true }), q('e')], 'one').map(x => x.id)).toEqual(['d']);
  });
  it('nothing pending → nothing', () => { expect(nextTake([q('a', { sentAt: 't' })], 'all')).toEqual([]); });
});
