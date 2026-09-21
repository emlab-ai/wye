import { describe, it, expect } from 'vitest';
import { plan, titleOf, imageRefs } from './import-docs';

const o = (extra: Partial<Parameters<typeof plan>[1]> = {}) => ({ project: 'v2', existing: new Set<string>(), date: '2026-09-21', ...extra });

describe('titleOf', () => {
  it('takes the front matter title, else the first heading, else the file name', () => {
    expect(titleOf('---\ntitle: Kitchen PRD\n---\n# Other\n', 'x.md')).toBe('Kitchen PRD');
    expect(titleOf('intro\n\n# Kitchen screen ##\n', 'x.md')).toBe('Kitchen screen');
    expect(titleOf('no heading here', 'notes/meeting_notes-2026.md')).toBe('meeting notes 2026');
  });
});

describe('plan', () => {
  it('one document per markdown file: front matter added, body untouched, status imported', () => {
    const p = plan([{ path: 'prd.md', text: '# Kitchen PRD\n\nOrders close when done.\n' }], o());
    expect(p.docs).toHaveLength(1);
    const d = p.docs[0];
    expect(d.slug).toBe('kitchen-prd'); expect(d.file).toBe('kitchen-prd.md'); expect(d.parent).toBeNull();
    expect(d.md).toBe('---\nnode: module:kitchen-prd\ntype: module\ntitle: Kitchen PRD\nstatus: imported\nowner: unassigned\nlast-verified: 2026-09-21\nsource: import/prd.md\n---\n\n# Kitchen PRD\n\nOrders close when done.\n');
  });
  it('keeps existing front matter (its node line wins) and merges the import keys; raw when analysis is declined', () => {
    const p = plan([{ path: 'a.md', text: '---\nnode: module:kept\ntitle: "Kept: yes"\nowner: alex\ncustom: 1\n---\nbody\n' }], o({ analyse: false }));
    expect(p.docs[0].slug).toBe('kept-yes');
    expect(p.docs[0].md).toContain('node: module:kept\ntitle: "Kept: yes"\nowner: alex\ncustom: 1\ntype: module\nstatus: raw\n');
    expect(p.docs[0].md).toContain('\n# Kept: yes\n\nbody\n');
  });
  it('a folder keeps its tree: subfolders become parent documents, files land under them, under the chosen parent', () => {
    const p = plan([
      { path: 'notes/2026/plan.md', text: '# Plan\n' },
      { path: 'notes/readme.md', text: '# Notes readme\n' },
      { path: 'top.md', text: '# Top\n' },
    ], o({ parent: 'research' }));
    const by = Object.fromEntries(p.docs.map(d => [d.slug, d]));
    expect(Object.keys(by).sort()).toEqual(['2026', 'notes', 'notes-readme', 'plan', 'top']);
    expect(by.top.parent).toBe('module:research');
    expect(by.notes.parent).toBe('module:research'); expect(by.notes.folder).toBe(true); expect(by.notes.md).toContain('status: raw');
    expect(by['2026'].parent).toBe('module:notes');
    expect(by.plan.parent).toBe('module:2026'); expect(by.plan.md).toContain('part-of: module:2026');
    expect(by['notes-readme'].parent).toBe('module:notes');
  });
  it('a slug the project has, or a repeated title, gets a numeric suffix; non-markdown, empty and huge files are skipped', () => {
    const p = plan([
      { path: 'a.md', text: '# Plan\n' }, { path: 'b.md', text: '# Plan\n' }, { path: 'c.txt', text: 'x' }, { path: 'd.md', text: '  \n' },
      { path: 'e.md', text: '# Big\n' + 'x'.repeat(1_000_001) },
    ], o({ existing: new Set(['plan']) }));
    expect(p.docs.map(d => d.slug)).toEqual(['plan-2', 'plan-3']);
    expect(p.skipped).toEqual([{ path: 'c.txt', reason: 'not markdown' }, { path: 'd.md', reason: 'empty' }, { path: 'e.md', reason: 'larger than 1 MB' }]);
  });
  it('relative images move to assets/ and the body follows; http and data urls stay', () => {
    const p = plan([{ path: 'spec/prd.md', text: '# PRD\n\n![shot](img/shot.png) ![web](https://x/y.png)\n' }], o());
    expect(p.assets).toEqual([{ from: 'spec/img/shot.png', to: 'assets/prd-shot.png' }]);
    expect(p.docs[1].md).toContain('![shot](assets/prd-shot.png) ![web](https://x/y.png)');
    expect(imageRefs('![a](assets/x.png) ![b](../c.png)')).toEqual(['../c.png']);
  });
});
