import { describe, it, expect } from 'vitest';
import { knowledgeChanged, nodeChanged } from './change';

describe('the change event', () => {
  it('a change that is not the graph\'s concerns no node and no list', () => {
    const d = { kinds: ['doc', 'session'], files: [] };
    expect(nodeChanged(d, 'req:a')).toBe(false); expect(knowledgeChanged(d)).toBe(false);
  });
  it('a graph change that names what changed concerns those nodes only', () => {
    const d = { kinds: ['graph'], files: [], graph: { ids: ['block:prd.x', 'module:prd'], knowledge: false } };
    expect(nodeChanged(d, 'module:prd')).toBe(true); expect(nodeChanged(d, 'req:a')).toBe(false); expect(knowledgeChanged(d)).toBe(false);
    expect(knowledgeChanged({ ...d, graph: { ids: ['req:a'], knowledge: true } })).toBe(true);
  });
  it('a graph change that does not say — an older server, more than the cap — concerns everything', () => {
    expect(nodeChanged({ kinds: ['graph'], files: [] }, 'req:a')).toBe(true);
    expect(knowledgeChanged({ kinds: ['graph'], files: [] })).toBe(true);
    expect(nodeChanged({ kinds: ['graph'], files: [], graph: { ids: null, knowledge: true } }, 'req:a')).toBe(true);
  });
});
