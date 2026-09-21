import { describe, it, expect } from 'vitest';
import { suggest, blocksFor } from './node-blocks';

describe('node-blocks', () => {
  it('a goal with no content is offered Requirements, Tasks and Sub-goals; one with a Requirements view is not offered it again', () => {
    expect(suggest('goal', 'goal:x.y', '').map(b => b.key)).toEqual(['reqs', 'tasks', 'subgoals']);
    expect(suggest('goal', 'goal:x.y', '## Requirements\n\n<!-- view:req part-of=goal:x.y -->\n').map(b => b.key)).toEqual(['tasks', 'subgoals']);
    expect(suggest('goal', 'goal:x.y', '<!-- view:req part-of=goal:x.yz -->').map(b => b.key)).toContain('reqs');
  });
  it('a requirement is offered when / then / unless until the child lines exist; the markdown carries the node slug', () => {
    expect(suggest('req', 'req:a.b', '- when:a.b the person clicks\n').map(b => b.key)).toEqual(['then', 'unless', 'tests']);
    expect(blocksFor('req')[0].markdown('req:a.b')).toBe('- when:a.b ');
  });
  it('a question is offered an Answer heading once; unknown kinds get nothing', () => {
    expect(suggest('question', 'question:q', '').map(b => b.key)).toEqual(['answer']);
    expect(suggest('question', 'question:q', '## Answer\n\nbecause').length).toBe(0);
    expect(suggest('city', 'city:london', '')).toEqual([]);
  });
});
