import { describe, it, expect, beforeEach } from 'vitest';
import { withRecent, loadRecent, rememberRecent, recentKey, RECENT_MAX } from './recent';

// the tests run in node: a browser's storage, in memory
const store = new Map<string, string>();
const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });

describe('withRecent', () => {
  it('puts the text on top, once, newest first', () => {
    expect(withRecent(['a'], 'b')).toEqual(['b', 'a']);
    expect(withRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(withRecent(['a'], '  b  ')).toEqual(['b', 'a']);
  });
  it('keeps at most N and ignores an empty text', () => {
    const many = Array.from({ length: RECENT_MAX }, (_, i) => `c${i}`);
    expect(withRecent(many, 'new')).toHaveLength(RECENT_MAX);
    expect(withRecent(many, 'new')[0]).toBe('new');
    expect(withRecent(['a'], '   ')).toEqual(['a']);
  });
});

describe('loadRecent / rememberRecent', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips per product', () => {
    expect(loadRecent('wye')).toEqual([]);
    rememberRecent('wye', 'first'); rememberRecent('wye', 'second');
    expect(loadRecent('wye')).toEqual(['second', 'first']);
    expect(loadRecent('other')).toEqual([]);
  });
  it('survives rubbish in storage', () => {
    localStorage.setItem(recentKey('wye'), '{not json');
    expect(loadRecent('wye')).toEqual([]);
    localStorage.setItem(recentKey('wye'), '[1, "ok", ""]');
    expect(loadRecent('wye')).toEqual(['ok']);
  });
});
