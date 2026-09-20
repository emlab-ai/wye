import { describe, it, expect } from 'vitest';
import { linkAll, countPlain } from './link-all';

describe('linkAll (req:wf2.editor.entity-from-text)', () => {
  it('links whole words in prose, leaves ids, links, code and frontmatter alone', () => {
    const md = '---\ntitle: London\n---\n\nfact:0 Thomas Kyd was born in the city of London. #superseded\n\nLondoner and London-based stay; [London](city:london) is linked; `London` is code; city:london is an id.\n\n```js\nconst x = "London";\n```\n';
    const r = linkAll(md, 'London', 'city:london');
    expect(r.count).toBe(1);
    expect(r.md).toContain('born in the city of [London](city:london).');
    expect(r.md).toContain('Londoner and London-based stay');
    expect(r.md).toContain('`London` is code');
    expect(r.md).toContain('const x = "London"');
    expect(r.md).toContain('title: London\n---');
  });
  it('inside a yaml card only the text values change', () => {
    const md = '```yaml\n- id: fact:1\n  title: Born in London\n  source: docs/London.md\n  text: >\n    He moved to London twice.\n  city: London\n```\n';
    const r = linkAll(md, 'London', 'city:london');
    expect(r.count).toBe(2);
    expect(r.md).toContain('title: Born in [London](city:london)');
    expect(r.md).toContain('    He moved to [London](city:london) twice.');
    expect(r.md).toContain('source: docs/London.md');
    expect(r.md).toContain('  city: London\n');
  });
  it('counts without changing', () => { expect(countPlain('London calling. London again.', 'London')).toBe(2); });
  it('is idempotent', () => { const once = linkAll('in London', 'London', 'city:london').md; expect(linkAll(once, 'London', 'city:london').count).toBe(0); });
});

it('never links a node\'s own line — a collection row keeps its plain title', () => {
  const md = '<!-- table:city -->\n- city:madrid Madrid\n<!-- /table:city -->\n\nWe flew to Madrid.\n';
  const r = linkAll(md, 'Madrid', 'city:madrid');
  expect(r.count).toBe(1);
  expect(r.md).toContain('- city:madrid Madrid\n');
  expect(r.md).toContain('We flew to [Madrid](city:madrid).');
});
