import { describe, it, expect } from 'vitest';
import { folderItems } from './doc-folders';

describe('folderItems', () => {
  it('each folder of documents is a top-level document holding its own documents', () => {
    const doc = (slug: string) => ({ slug, node: `module:${slug}`, title: slug, icon: '📄', project: 'v2', children: [] });
    const items = folderItems([{ slug: 'v2', title: 'Wye v2', icon: '🚀', roots: [doc('prd'), doc('design')] }, { slug: 'evaluation', title: 'Evaluation', icon: '', roots: [] }], '/wye');
    expect(items.map(i => [i.title, i.href, i.folder, i.children.length])).toEqual([['Wye v2', '/wye/v2', true, 2], ['Evaluation', '/wye/evaluation', true, 0]]);
    expect(items[1].icon).toBe('📁');
    expect(new Set(items.map(i => i.slug)).size).toBe(2);
  });
});
