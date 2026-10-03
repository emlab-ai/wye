import { describe, it, expect } from 'vitest';
import { Citations, citedNumbers } from './citations';

describe('Citations', () => {
  it('numbers in order and dedupes by ref', () => {
    const c = new Citations();
    expect(c.add({ ref: 'req:a', source: 'node', title: 'A', href: null, snippet: '' }).n).toBe(1);
    expect(c.add({ ref: 'x.ts:1-2', source: 'code', title: 'x', href: null, snippet: '' }).n).toBe(2);
    expect(c.add({ ref: 'req:a', source: 'node', title: 'A again', href: null, snippet: '' }).n).toBe(1);
    expect(c.all().length).toBe(2); expect(c.byRef('x.ts:1-2')?.n).toBe(2); expect(c.get(1)?.ref).toBe('req:a');
  });
});
describe('citedNumbers', () => {
  it('finds [n] and [n, m] markers, unique, in order', () => { expect(citedNumbers('a [2] b [1, 3] c [2] [x]')).toEqual([2, 1, 3]); });
});
