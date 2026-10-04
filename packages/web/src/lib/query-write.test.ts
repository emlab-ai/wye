import { describe, it, expect } from 'vitest';
import { writePrompt, writeQuery } from './query-write';

describe('a query written from words', () => {
  it("the prompt carries the table's kind, page, current SQL, who me is, and a failed try", () => {
    const p = writePrompt({ ask: 'late tasks', kind: 'task', page: 'v2/plan', sql: 'SELECT id FROM nodes', me: ['person:a'] }, 'nodes columns: id VARCHAR', { sql: 'SELECT x', message: 'no column x' });
    expect(p).toContain("kind task, on the page 'v2/plan'");
    expect(p).toContain('SELECT id FROM nodes');
    expect(p).toContain("\"me\" is 'person:a'");
    expect(p).toContain('Error: no column x');
    expect(p).toContain('What the person wants: late tasks');
  });
  it('nothing asked, nothing written', async () => {
    expect(await writeQuery('p', { ask: '  ' }, new AbortController().signal)).toEqual({ ok: false, message: 'say what the table should show' });
  });
});
