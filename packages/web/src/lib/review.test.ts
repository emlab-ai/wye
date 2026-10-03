import { describe, it, expect } from 'vitest';
import { reviewQueue } from './review';
import { indexGraph, type GraphData } from './graph';

const n = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: id.split(':')[0], title: id, status: 'proposed', section: '', subsection: '', body: `id: ${id}`, defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1, ...extra });

describe('reviewQueue', () => {
  it('lists each block an item points at once, however many edges lead there (a contradiction is between and contradicts)', () => {
    const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, nodes: [n('contradiction:p.k1', { status: 'open' }), n('decision:a', { status: 'approved' }), n('req:b', { status: 'approved' })],
      edges: [{ from: 'contradiction:p.k1', to: 'decision:a', verb: 'between' }, { from: 'contradiction:p.k1', to: 'decision:a', verb: 'contradicts' }, { from: 'contradiction:p.k1', to: 'req:b', verb: 'between' }] } as unknown as GraphData;
    const item = reviewQueue('p', g, indexGraph(g)).find(i => i.id === 'contradiction:p.k1')!;
    expect(item.refs).toEqual(['decision:a', 'req:b']);
  });
});
