import { describe, it, expect } from 'vitest';
import { tableSql, colOf } from './table-sql';
import { parseViewQuery, viewQuery, EMPTY_FILTERS } from './instance-table';
import { COLLECTION_OPEN } from './import';

const f = (q: string) => parseViewQuery(q, ['severity', 'owner']);

describe('a table is SQL', () => {
  it("a new table on a page: this page's open items of the kind", () => {
    expect(tableSql({ kind: 'task', page: 'v2/plan', f: EMPTY_FILTERS })).toBe("SELECT id FROM nodes\nWHERE kind = 'task'\n  AND page = 'v2/plan'\n  AND open\nORDER BY coalesce(due, target), title");
  });
  it('the whole product drops the page; show done drops open', () => {
    expect(tableSql({ kind: 'goal', f: f('done=show') })).toBe("SELECT id FROM nodes\nWHERE kind = 'goal'\nORDER BY coalesce(due, target), title");
  });
  it('each filter adds its line', () => {
    const sql = tableSql({ kind: 'bug', page: 'module:x', f: f("q=it's status=open due=7d severity=high owner=me sort=-severity"), me: ['person:a', 'alex'] });
    expect(sql).toContain("AND status = 'open'");
    expect(sql).not.toContain('AND open\n');
    expect(sql).toContain("AND (title ILIKE '%it''s%' OR text ILIKE '%it''s%')");
    expect(sql).toContain('AND try_cast(due AS DATE) <= current_date + 7');
    expect(sql).toContain("AND has(severity, 'high')");
    expect(sql).toContain("AND (has(owner, 'person:a') OR has(owner, 'alex'))");
    expect(sql).toContain('ORDER BY severity DESC, title');
  });
  it('a keyword or a dashed property is a quoted or underscored column', () => {
    expect(colOf('from')).toBe('"from"'); expect(colOf('part-of')).toBe('part_of'); expect(colOf('owner')).toBe('owner');
  });
  it('the SQL survives the marker: quotes, > and ->', () => {
    const sql = `SELECT id FROM nodes WHERE "from" = 'x' AND props->>'a' >= '1'`;
    const q = viewQuery({ ...EMPTY_FILTERS, sql });
    expect(parseViewQuery(q, []).sql).toBe(sql);
    const m = `<!-- table:task ${q} -->`.match(COLLECTION_OPEN);
    expect(m?.[2].trim()).toBe(q);
  });
});
