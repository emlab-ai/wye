import { describe, it, expect } from 'vitest';
import { builtWith, classify } from './watch';

describe('classify', () => {
  it('a graph build is a graph change', () => { expect(classify('_build/graph.json')).toBe('graph'); });
  it('the Ask index is not: its writes must not make every open page refetch', () => {
    expect(classify('_build/search.lance/scopes.json')).toBe('other');
    expect(classify('_build/search.lance/chunks.lance/data/x.lance')).toBe('other');
  });
});

describe('builtWith', () => {
  const read = new Map([['/p/docs/a.md', 1990.4], ['/p/docs/b.md', 1500]]);
  it('a document that still has the mtime the build found is in the graph: no second build for a save', () => {
    expect(builtWith(read, [['/p/docs/a.md', 1990.4]])).toBe(true);
  });
  it('a document written since is not', () => { expect(builtWith(read, [['/p/docs/a.md', 1990.4], ['/p/docs/b.md', 2000.3]])).toBe(false); });
  it('a document the build did not read, or one that is gone, is never covered', () => {
    expect(builtWith(read, [['/p/_product.md', 1000]])).toBe(false);
    expect(builtWith(read, [['/p/docs/a.md', null]])).toBe(false);
  });
});
