import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkTags from './remark-tags';

type AnyNode = { type: string; url?: string; value?: string; children?: AnyNode[] };
const links = (md: string) => {
  const tree = unified().use(remarkParse).parse(md) as unknown as AnyNode;
  remarkTags()(tree as never);
  const out: { url: string; text: string }[] = [];
  const walk = (n: AnyNode) => { if (n.type === 'link') out.push({ url: n.url!, text: (n.children ?? []).map(c => c.value ?? '').join('') }); (n.children ?? []).forEach(walk); };
  walk(tree); return out;
};

describe('remarkTags', () => {
  it('turns ids in text into tag links', () => {
    expect(links('See rule:r1 and req:m.a.b, then page:web/node.')).toEqual([
      { url: '#tag:rule:r1', text: 'rule:r1' }, { url: '#tag:req:m.a.b', text: 'req:m.a.b' }, { url: '#tag:page:web/node', text: 'page:web/node' }]);
  });
  it('turns backticked ids into tag links and strips test methods', () => {
    expect(links('run `test:core-writer#patch-body`')).toEqual([{ url: '#tag:test:core-writer', text: 'test:core-writer#patch-body' }]);
  });
  it('leaves existing links alone and ignores words that are not ids', () => {
    expect(links('[rule:r1](http://x) and status: proposed')).toEqual([{ url: 'http://x', text: 'rule:r1' }]);
  });
});
