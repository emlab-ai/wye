import { describe, it, expect } from 'vitest';
import { convertWikilinks, resolver, graphNames, nameKey } from './wikilinks';
import { plan } from './import-docs';

const r = resolver(
  [{ id: 'person:ea.jane-roe', names: ['Jane Roe', 'JR'] }],
  [{ id: 'module:atlas', names: ['Atlas', 'Projects/Atlas.md'] }],
);

describe('[[wikilinks]] to Wye links', () => {
  it('a name, an alias, a heading, a folder path', () => {
    const c = convertWikilinks('Met [[Jane Roe]] and [[JR|Jane]] about [[Atlas#Risks]] and [[Projects/Atlas]].', r);
    expect(c.text).toBe('Met [Jane Roe](person:ea.jane-roe) and [Jane](person:ea.jane-roe) about [Atlas](module:atlas) and [Atlas](module:atlas).');
    expect(c.resolved).toBe(4);
  });
  it('an unknown name stays as written; images become images; code is left alone', () => {
    const c = convertWikilinks('See [[Nobody]], ![[diagram 1.png]], `[[Jane Roe]]`\n```\n[[Jane Roe]]\n```\n', r);
    expect(c.text).toBe('See [[Nobody]], ![](diagram%201.png), `[[Jane Roe]]`\n```\n[[Jane Roe]]\n```\n');
    expect(c.unresolved).toEqual(['Nobody']);
  });
  it('names match the way Obsidian does: case, underscores, a leading underscore', () => {
    expect(nameKey('_Robin')).toBe('robin'); expect(nameKey('jane_roe.md')).toBe('jane roe');
    expect(convertWikilinks('[[jane roe]]', r).text).toBe('[jane roe](person:ea.jane-roe)');
  });
  it('the graph knows things by title, name and aliases, pages by title and the file they came from', () => {
    const g = graphNames([
      { id: 'type:person', kind: 'type', title: 'p', defined: true },
      { id: 'person:ea.kim', kind: 'person', title: 'Kim Lee', defined: true, body: 'name: Kim Lee\naliases: [Kimmy, "K. Lee"]' },
      { id: 'module:kim-notes', kind: 'module', title: 'Overview', defined: true, body: 'source: "import/Vault/People/Kim.md"' },
    ], [{ id: 'module:kim-notes', title: 'Overview' }]);
    const res = resolver(g.entities, g.pages);
    expect(res('Kimmy')).toBe('person:ea.kim'); expect(res('K. Lee')).toBe('person:ea.kim');
    expect(res('Kim')).toBe('module:kim-notes');
  });
});

describe('an import converts links between its own files', () => {
  it('a link to another file of the import points at its page; the product\'s people come first', () => {
    const p = plan([
      { path: 'V/People/Kim Lee.md', text: '# Kim\n\nworks with [[Jane Roe]] and [[Sam]]' },
      { path: 'V/Meetings/Sync.md', text: '# Sync\n\n[[Kim Lee]] presented. ![[chart.png]]' },
    ], { project: 'p', analyse: false, existing: new Set(), links: { entities: resolver([{ id: 'person:ea.jane-roe', names: ['Jane Roe'] }]) } });
    const kim = p.docs.find(d => d.from === 'V/People/Kim Lee.md')!; const sync = p.docs.find(d => d.from === 'V/Meetings/Sync.md')!;
    expect(kim.md).toContain('works with [Jane Roe](person:ea.jane-roe) and [[Sam]]');
    expect(sync.md).toContain(`[Kim Lee](module:${kim.slug}) presented.`);
    expect(sync.md).toContain(`![](assets/${sync.slug}-chart.png)`);
    expect(p.assets).toContainEqual({ from: 'V/Meetings/chart.png', to: `assets/${sync.slug}-chart.png` });
  });
});
