import { describe, it, expect } from 'vitest';
import { readOnly, propsOf, runQuery } from './query';

describe('graph queries', () => {
  it('only one read statement: SELECT, WITH, FROM', () => {
    expect(readOnly("SELECT id FROM nodes WHERE title = 'a;b'")).toBeNull();
    expect(readOnly('FROM nodes LIMIT 3;')).toBeNull();
    expect(readOnly('WITH x AS (SELECT 1) SELECT * FROM x')).toBeNull();
    expect(readOnly('DELETE FROM nodes')).toBe('only a read query: SELECT, WITH or FROM');
    expect(readOnly('SELECT 1; DROP TABLE nodes')).toBe('one statement at a time');
    expect(readOnly('  ')).toBe('the query is empty');
  });
  it("a card's keys become its props, quotes off, id left out", () => {
    expect(propsOf('id: commitment:ea.x\ntext: Ship it\ndue: 2026-10-07\nstate: open\nto: [person:ea.k]\n  nested: no\ntitle: "A: b"')).toEqual({ text: 'Ship it', due: '2026-10-07', state: 'open', to: '[person:ea.k]', title: 'A: b' });
  });
  it('a query that is not read-only is refused before any engine runs', async () => {
    expect(await runQuery('nope', 'UPDATE nodes SET title = 1')).toEqual({ ok: false, status: 422, message: 'only a read query: SELECT, WITH or FROM' });
  });
});
