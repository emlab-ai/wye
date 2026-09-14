import { describe, it, expect } from 'vitest';
import { layoutMindMap } from './layout';

const n = (id: string) => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file: 'f', line: 1 });

describe('layoutMindMap', () => {
  const nodes = [n('req:a'), n('req:a.b'), n('req:a.c'), n('rule:r')];
  const edges = [
    { from: 'req:a.b', to: 'req:a', verb: 'refines' },
    { from: 'req:a.c', to: 'req:a', verb: 'refines' },
    { from: 'req:a', to: 'rule:r', verb: 'satisfied-by' },
  ];
  it('positions every node and puts children to the right of the focus', () => {
    const { positions } = layoutMindMap(nodes, edges, 'req:a');
    expect(positions.size).toBe(4);
    expect(positions.get('req:a.b')!.x).toBeGreaterThan(positions.get('req:a')!.x);
    expect(positions.get('req:a.c')!.x).toBeGreaterThan(positions.get('req:a')!.x);
  });
  it('marks refines edges as tree edges and others as cross-links', () => {
    const { treeEdges } = layoutMindMap(nodes, edges, 'req:a');
    expect(treeEdges.has('req:a.b|refines|req:a')).toBe(true);
    expect(treeEdges.has('req:a|satisfied-by|rule:r')).toBe(false);
  });
  it('works with no focus (forest)', () => {
    const { positions } = layoutMindMap(nodes, edges, null);
    expect(positions.size).toBe(4);
  });
});
