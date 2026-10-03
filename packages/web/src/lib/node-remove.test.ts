import { describe, it, expect } from 'vitest';
import { removeNode } from './node-content';

describe('removeNode', () => {
  it('a card alone in its fence goes with the fence and its content', () => {
    const md = 'intro\n\n```yaml\n- id: req:a\n  title: A\n  status: proposed\n```\n\n  verdict:k1 refines req:b — x\n\n  - when:a the trigger\n\nafter\n';
    expect(removeNode(md, 'req:a', 3, 'yaml')).toBe('intro\n\nafter\n');
  });
  it('a card among others leaves the rest of its fence as it was', () => {
    const md = '```yaml\n- id: req:a\n  title: A\n- id: req:b\n  title: B\n- id: req:c\n  title: C\n```\n\n  verdict:k on c\n';
    expect(removeNode(md, 'req:b', 4, 'yaml')).toBe('```yaml\n- id: req:a\n  title: A\n- id: req:c\n  title: C\n```\n\n  verdict:k on c\n');
  });
  it('the last card of a fence takes its content along, the fence stays for the others', () => {
    const md = '```yaml\n- id: req:a\n  title: A\n- id: req:b\n  title: B\n```\n\n  verdict:k on b\n\nnext\n';
    expect(removeNode(md, 'req:b', 4, 'yaml')).toBe('```yaml\n- id: req:a\n  title: A\n```\n\nnext\n');
  });
  it('a prose node goes with its continuation and the blocks under it', () => {
    const md = '- req:x The thing\n  more of its text\n  - when:x a trigger\n- req:y Another\n';
    expect(removeNode(md, 'req:x', 1, 'prose')).toBe('- req:y Another\n');
  });
  it('is null when the node is not in the document', () => {
    expect(removeNode('nothing here\n', 'req:a', 1, 'yaml')).toBeNull();
    expect(removeNode('nothing here\n', 'req:a', 1, 'prose')).toBeNull();
  });
});
