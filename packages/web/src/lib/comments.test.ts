import { describe, it, expect } from 'vitest';
import { commentRow, commentId, commentsOn } from './comments';
import type { GraphData } from './graph';

describe('comments (decision:ontology.comment-is-a-ref)', () => {
  it('a row is the id, the text on one line, and on / by / date in the trailing group', () => {
    expect(commentRow('comment:london-1a2b', 'Is this\nthe capital?', 'city:london', 'alex', '2026-09-20')).toBe('- comment:london-1a2b Is this the capital? (on: city:london, by: alex, date: 2026-09-20)');
  });
  it('softens what would read as a status tag or a property group', () => {
    expect(commentRow('comment:x-0000', 'mark #done (see: req:y)', 'req:x', 'alex', '2026-09-20')).toBe('- comment:x-0000 mark # done — see: req:y (on: req:x, by: alex, date: 2026-09-20)');
  });
  it('the id comes from the node and skips taken ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add(commentId('req:ontology.instance-home', x => ids.has(x)));
    expect(ids.size).toBe(20);
    expect([...ids][0]).toMatch(/^comment:ontology-instance-home-[0-9a-f]{4}$/);
  });
  it('lists the comments on a node from the `on` edges, in document order', () => {
    const g = { nodes: [
      { id: 'comment:a', kind: 'comment', defined: true, file: 'p/docs/comments.md', line: 12, body: 'id: comment:a\ntext: second\non: req:x\nby: alex\ndate: 2026-09-20' },
      { id: 'comment:b', kind: 'comment', defined: true, file: 'p/docs/comments.md', line: 11, body: 'id: comment:b\ntext: first\non: req:x\nby: agent:1\ndate: 2026-09-19' },
      { id: 'comment:c', kind: 'comment', defined: true, file: 'p/docs/comments.md', line: 13, body: 'id: comment:c\ntext: other\non: req:y' }],
      edges: [{ from: 'comment:a', to: 'req:x', verb: 'on' }, { from: 'comment:b', to: 'req:x', verb: 'on' }, { from: 'comment:c', to: 'req:y', verb: 'on' }] } as unknown as GraphData;
    expect(commentsOn(g, 'req:x').map(c => [c.id, c.text, c.by])).toEqual([['comment:b', 'first', 'agent:1'], ['comment:a', 'second', 'alex']]);
  });
});
