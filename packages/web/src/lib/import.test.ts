import { describe, it, expect } from 'vitest';
import { prepare, expand, nodePropsFromChunk, escapeAngles, protectCode, splitCode, BS } from './import';
import { blocksToMarkdown } from './serialize';

const t = (text: string) => ({ type: 'text', text, styles: {} });

describe('prepare', () => {
  it('lifts yaml blocks and rules into markers and unwraps prose', () => {
    const p = prepare('# T\n\nwrapped\nline\n\n---\n\n```yaml\n- id: req:a\n  title: A\n```\n\nafter');
    expect(p.md).toBe('# T\n\nwrapped line\n\n%%DIVIDER%%\n\n%%YAML:0%%\n\nafter');
    expect(p.yaml[0][0]).toEqual({ id: 'req:a', body: 'id: req:a\ntitle: A' });
  });
});

describe('escapeAngles', () => {
  it('escapes tag-like angle brackets outside code spans only', () => {
    expect(escapeAngles('| op:x | <id or suffix> | `<kept>` | a < b |')).toBe('| op:x | &lt;id or suffix> | `&lt;kept>` | a < b |');
    const blocks = expand([{ type: 'paragraph', content: [t('args &lt;id or suffix>')] }], []);
    expect((blocks[0].content as { text: string }[])[0].text).toBe('args <id or suffix>');
  });
});

describe('splitCode', () => {
  it('separates fenced, indented and inline code from text', () => {
    const md = 'a `x` b\n\n    ind\n    ent\n\ntext\n```sh\nfen\n```\ntail';
    const parts = splitCode(md);
    expect(parts.filter((_, i) => i % 2 === 1)).toEqual(['`x`', '    ind\n    ent\n\n', '```sh\nfen\n```\n']);
    expect(parts.join('')).toBe(md);
  });
  it('escapes tag-like angle brackets everywhere, code included, and the importer restores them', () => {
    expect(escapeAngles('see <b>\n\n    <tag>\n\n```\n<x>\n```')).toBe('see &lt;b>\n\n    &lt;tag>\n\n```\n&lt;x>\n```');
    const blocks = expand([{ type: 'codeBlock', props: { language: 'sh' }, content: [t('run --target &lt;sim udid>')] }], []);
    expect((blocks[0].content as { text: string }[])[0].text).toBe('run --target <sim udid>');
  });
});

describe('protectCode', () => {
  it('holds backslashes inside inline code and restores them after parsing', () => {
    const md = 'run `grep -rho "10\\.0\\|x"` now \\ outside';
    const p = protectCode(md);
    expect(p).toBe(`run \`grep -rho "10${BS}.0${BS}|x"\` now \\ outside`);
    const blocks = expand([{ type: 'paragraph', content: [t('a '), { type: 'text', text: `grep "10${BS}.0"`, styles: { code: true } }] }], []);
    expect(JSON.stringify(blocks)).toContain('grep \\"10\\\\.0\\"');
  });
});

describe('nodePropsFromChunk', () => {
  it('picks the text key, status and keeps the body', () => {
    const n = nodePropsFromChunk({ id: 'rule:r', body: 'id: rule:r\nstatement: >\n  two\n  lines\nsource: f\nstatus: proposed # note' })!;
    expect(n.props).toMatchObject({ kind: 'rule', slug: 'r', status: 'proposed', form: 'yaml', textKey: 'statement' });
    expect(n.text).toBe('two lines');
  });
});

describe('expand', () => {
  it('turns markers into divider and node blocks, id-first paragraphs into prose nodes, and tags ids', () => {
    const p = prepare('req:sale.close When done, et:order is Closed. #proposed (owner: alex)\n\n---\n\n```yaml\nid: rule:x\nstatement: S\n```\n\nPlain rule:x mention.');
    const parsed = p.md.split('\n\n').map(s => ({ type: 'paragraph', content: [t(s)] }));
    const blocks = expand(parsed, p.yaml);
    expect(blocks.map(b => b.type)).toEqual(['node', 'divider', 'node', 'paragraph']);
    expect(blocks[0].props).toMatchObject({ kind: 'req', slug: 'sale.close', status: 'proposed', form: 'prose', extra: 'owner: alex' });
    expect(JSON.stringify(blocks[0].content)).toContain('"id":"entity:order"');
    expect((blocks[0].content as { text?: string }[])[0].text).toBe('When done, ');
    expect(blocks[2].props).toMatchObject({ kind: 'rule', slug: 'x', form: 'yaml', textKey: 'statement' });
    expect(JSON.stringify(blocks[3].content)).toContain('"id":"rule:x"');
  });
  it('lifts id links into markers and expands them into link inline content', () => {
    const p = prepare('req:a When all [kitchen items](entity:kitchen-item) are done. #proposed');
    expect(p.md).toBe('req:a When all ⟦kitchen items|entity:kitchen-item⟧ are done. #proposed');
    const blocks = expand([{ type: 'paragraph', content: [t(p.md)] }], []);
    const c = blocks[0].content as { type: string; href?: string; content?: { text: string }[]; text?: string }[];
    expect(c.map(i => i.type)).toEqual(['text', 'link', 'text']);
    expect(c[1].href).toBe('entity:kitchen-item'); expect(c[1].content![0].text).toBe('kitchen items');
    expect(blocksToMarkdown(blocks)).toBe('req:a When all [kitchen items](entity:kitchen-item) are done. #proposed\n');
  });
  it('turns checkbox items with ids into task nodes whose status follows the box', () => {
    const blocks = expand([{ type: 'checkListItem', props: { checked: false }, content: [t('task:a Build it')] }, { type: 'checkListItem', props: { checked: true }, content: [t('tk:b Ship it')] }], []);
    expect(blocks[0].props).toMatchObject({ kind: 'task', slug: 'a', status: 'open', check: 'todo' });
    expect(blocks[1].props).toMatchObject({ kind: 'task', slug: 'b', status: 'done', check: 'done' });
    expect(blocksToMarkdown(blocks)).toBe('- [ ] task:a Build it\n- [x] task:b Ship it\n');
    const bl = expand([{ type: 'bulletListItem', content: [t('qn:x Is it?')] }], []);
    expect(blocksToMarkdown(bl)).toBe('- question:x Is it?\n');
  });
  it('round-trips through the serializer', () => {
    const src = 'req:sale.close When done, entity:order is Closed. #proposed (owner: alex)\n\n---\n\n```yaml\n- id: rule:x\n  statement: S\n  source: f.ts\n```\n';
    const p = prepare(src);
    const parsed = p.md.split('\n\n').map(s => ({ type: 'paragraph', content: [t(s)] }));
    expect(blocksToMarkdown(expand(parsed, p.yaml))).toBe(src);
  });
});
