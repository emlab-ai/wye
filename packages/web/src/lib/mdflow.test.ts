import { describe, it, expect } from 'vitest';
import { unwrapParagraphs, tagifyInline, tagifyBlocks } from './mdflow';

describe('unwrapParagraphs', () => {
  it('joins wrapped paragraph lines and leaves structure alone', () => {
    const md = '# Title\n\nThis is a long\nparagraph that wraps\nover lines.\n\n- item one\n  continues\n- item two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode\nstays\n```\n\nLast  \nhard break kept.';
    expect(unwrapParagraphs(md)).toBe('# Title\n\nThis is a long paragraph that wraps over lines.\n\n- item one continues\n- item two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode\nstays\n```\n\nLast  \nhard break kept.');
  });
  it('joins wrapped list items but not nested items or indented code after a blank line', () => {
    expect(unwrapParagraphs('- req:a When x\n  happens, then y.\n  - nested\n- b\n\n    code')).toBe('- req:a When x happens, then y.\n  - nested\n- b\n\n    code');
  });
  it('does not join across a heading or a rule', () => {
    expect(unwrapParagraphs('text\n## H\nmore\n---\nend')).toBe('text\n## H\nmore\n---\nend');
  });
});

describe('tagifyInline', () => {
  it('splits text on ids and keeps trailing punctuation as text', () => {
    expect(tagifyInline([{ type: 'text', text: 'see rule:r1, then req:m.a.', styles: {} }])).toEqual([
      { type: 'text', text: 'see ', styles: {} }, { type: 'tag', props: { id: 'rule:r1' } }, { type: 'text', text: ', then ', styles: {} }, { type: 'tag', props: { id: 'req:m.a' } }, { type: 'text', text: '.', styles: {} }]);
  });
  it('turns a code run that is exactly an id into a tag and leaves other code alone', () => {
    expect(tagifyInline([{ type: 'text', text: 'page:web/node', styles: { code: true } }, { type: 'text', text: 'ctx check', styles: { code: true } }])).toEqual([
      { type: 'tag', props: { id: 'page:web/node' } }, { type: 'text', text: 'ctx check', styles: { code: true } }]);
  });
  it('leaves code blocks alone', () => {
    const out = tagifyBlocks([{ type: 'codeBlock', content: [{ type: 'text', text: '- module:a -(calls)-> op:b', styles: {} }] }] as never[]);
    expect(JSON.stringify(out)).not.toContain('"tag"');
  });
  it('recurses into links and table cells', () => {
    const blocks = tagifyBlocks([{ type: 'paragraph', content: [{ type: 'link', href: 'x', content: [{ type: 'text', text: 'op:o', styles: {} }] }] }, { type: 'table', content: { type: 'tableContent', rows: [{ cells: [[{ type: 'text', text: 'req:a', styles: {} }]] }] } }] as never[]);
    expect(JSON.stringify(blocks)).toContain('"type":"tag","props":{"id":"op:o"}');
    expect(JSON.stringify(blocks)).toContain('"type":"tag","props":{"id":"req:a"}');
  });
});
