import { describe, it, expect } from 'vitest';
import { classify } from './watch';

describe('classify', () => {
  it('a graph build is a graph change', () => { expect(classify('_build/graph.json')).toBe('graph'); });
  it('the Ask index is not: its writes must not make every open page refetch', () => {
    expect(classify('_build/search.lance/scopes.json')).toBe('other');
    expect(classify('_build/search.lance/chunks.lance/data/x.lance')).toBe('other');
  });
});
