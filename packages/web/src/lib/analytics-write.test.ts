import { describe, it, expect } from 'vitest';
import { writePrompt } from './analytics-write';

describe('the prompt that writes an analytics page from words', () => {
  const graph = 'kinds (count): task (14), goal (2)\nproperties the items carry, with the values they hold:\n  worker: person:ana, person:bo\nlink verbs (count): worker (14), part-of (20)';
  it('teaches the line, shows the graph, the line as it is, and the ask', () => {
    const p = writePrompt({ ask: 'tasks by team per month', query: 'kind=task y=worker x=status' }, graph);
    expect(p).toContain('y=<dims>');
    expect(p).toContain('when:span');
    expect(p).toContain('due:month, when:week, date:quarter');
    expect(p).toContain('worker: person:ana, person:bo');
    expect(p).toContain('The line as it is now:\nkind=task y=worker x=status');
    expect(p).toContain('What the person wants: tasks by team per month');
    expect(p).not.toContain('previous line failed');
  });
  it('says what an empty line means, and carries the engine\'s complaint back', () => {
    const p = writePrompt({ ask: 'a kanban' }, graph, { query: 'kind=task sql="SELECT nope"', message: 'Parser Error' });
    expect(p).toContain('(empty — every item, one row, one column)');
    expect(p).toContain('Your previous line failed:\nkind=task sql="SELECT nope"\nError: Parser Error');
  });
});
