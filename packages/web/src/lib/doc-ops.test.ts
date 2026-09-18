import { describe, it, expect } from 'vitest';
import { copySlug, duplicateMarkdown, subtree } from './doc-ops';
import type { DocNode } from './doc';

describe('copySlug', () => {
  it('appends -copy, then -copy-2, -copy-3 while the slug is taken', () => {
    expect(copySlug('prd', new Set())).toBe('prd-copy');
    expect(copySlug('prd', new Set(['prd-copy']))).toBe('prd-copy-2');
    expect(copySlug('prd', new Set(['prd-copy', 'prd-copy-2']))).toBe('prd-copy-3');
  });
});

describe('duplicateMarkdown', () => {
  const md = [
    '---', 'node: module:prd', 'type: module', 'title: PRD', 'status: active', 'part-of: module:wf2', 'order: 20', '---',
    '# PRD', '', 'Text about module:prd and req:prd.a; see module:other.', '',
    '```yaml', '- id: req:prd.a', '  title: A', '  refines: req:other.z', '  status: proposed', '```', '',
    'rule:prd-scroll The page scrolls. #shipped', '', '- [ ] task:prd-task Do it, part of module:prd',
  ].join('\n');
  const ids = ['module:prd', 'req:prd.a', 'rule:prd-scroll', 'task:prd-task'];
  it('rewrites the node line, the title and every id the document defines to -copy; other ids stay', () => {
    const out = duplicateMarkdown(md, { ids, slug: 'prd', newSlug: 'prd-copy' });
    expect(out).toBe([
      '---', 'node: module:prd-copy', 'type: module', 'title: PRD (copy)', 'status: active', 'part-of: module:wf2', 'order: 20', '---',
      '# PRD (copy)', '', 'Text about module:prd-copy and req:prd.a-copy; see module:other.', '',
      '```yaml', '- id: req:prd.a-copy', '  title: A', '  refines: req:other.z', '  status: proposed', '```', '',
      'rule:prd-scroll-copy The page scrolls. #shipped', '', '- [ ] task:prd-task-copy Do it, part of module:prd-copy',
    ].join('\n'));
  });
  it('a copy of a copy takes the new slug as its suffix, not -copy-copy', () => {
    const out = duplicateMarkdown(md, { ids, slug: 'prd', newSlug: 'prd-copy-2' });
    expect(out).toContain('node: module:prd-copy-2');
    expect(out).toContain('- id: req:prd.a-copy-2');
  });
  it('a title that already ends in (copy) is left alone; a quoted title keeps its quotes', () => {
    const q = md.replace('title: PRD', 'title: "PRD: v2"');
    expect(duplicateMarkdown(q, { ids, slug: 'prd', newSlug: 'prd-copy' })).toContain('title: "PRD: v2 (copy)"');
    const c = md.replace('title: PRD', 'title: PRD (copy)');
    expect(duplicateMarkdown(c, { ids, slug: 'prd', newSlug: 'prd-copy' })).toContain('title: PRD (copy)\n');
  });
});

describe('subtree', () => {
  const d = (slug: string, children: DocNode[] = []): DocNode => ({ module: { id: `module:${slug}` } as DocNode['module'], file: `${slug}.md`, slug, title: slug, children });
  it('lists the document first, then every descendant, depth first', () => {
    const t = d('a', [d('b', [d('c')]), d('e')]);
    expect(subtree(t).map(x => x.slug)).toEqual(['a', 'b', 'c', 'e']);
  });
});
