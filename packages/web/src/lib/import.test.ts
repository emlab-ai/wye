import { describe, it, expect } from 'vitest';
import { prepare, expand, nodePropsFromChunk, escapeAngles, protectCode, splitCode, BS, PIPE } from './import';
import { blocksToMarkdown } from './serialize';
import { ID_RE, cleanId, setKinds } from './ids';
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
  it('keeps an escaped pipe inside a table cell as one token and restores it as a pipe', () => {
    const md = '| a | b |\n|---|---|\n| `x \\| y` | z |';
    const p = protectCode(md);
    expect(p).toBe(`| a | b |\n|---|---|\n| \`x ${PIPE} y\` | z |`);
    const blocks = expand([{ type: 'paragraph', content: [{ type: 'text', text: `x ${PIPE} y`, styles: { code: true } }] }], []);
    expect((blocks[0].content as { text: string }[])[0].text).toBe('x | y');
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
    const nl = expand([{ type: 'numberedListItem', content: [t('rl:a First')] }, { type: 'numberedListItem', content: [t('rl:b Second')] }], []);
    expect(nl[1].props).toMatchObject({ list: 'number' });
    expect(blocksToMarkdown(nl)).toBe('1. rule:a First\n2. rule:b Second\n');
  });
  it('keeps and expands the children of an id-first list item', () => {
    const blocks = expand([{ type: 'checkListItem', props: { checked: false }, content: [t('task:a Build it')], children: [
      { type: 'bulletListItem', content: [t('a detail about entity:order')] },
      { type: 'checkListItem', props: { checked: true }, content: [t('task:b Sub task')] },
    ] }], []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('node');
    expect(blocks[0].children).toHaveLength(2);
    expect(blocks[0].children?.[0].type).toBe('bulletListItem');
    expect(blocks[0].children?.[0].content).toEqual([t('a detail about '), { type: 'tag', props: { id: 'entity:order' } }]);
    expect(blocks[0].children?.[1].type).toBe('node');
    expect(blocks[0].children?.[1].props).toMatchObject({ kind: 'task', slug: 'b', check: 'done' });
    expect(blocksToMarkdown(blocks)).toBe('- [ ] task:a Build it\n  - a detail about entity:order\n  - [x] task:b Sub task\n');
  });
  it('lifts drawing links into markers and expands them into drawing blocks', () => {
    const p = prepare('Intro.\n\n![Sync flow](drawings/sync-flow.excalidraw)\n\nAfter.\n');
    expect(p.drawings).toEqual([{ title: 'Sync flow', src: 'drawings/sync-flow.excalidraw' }]);
    expect(p.md).toContain('%%DRAWING:0%%');
    const blocks = expand(p.md.split(/\n\n+/).filter(Boolean).map(x => ({ type: 'paragraph', content: [t(x.trim())] })), p.yaml, p.drawings);
    expect(blocks[1]).toEqual({ type: 'drawing', props: { src: 'drawings/sync-flow.excalidraw', title: 'Sync flow' } });
    expect(blocksToMarkdown(blocks)).toBe('Intro.\n\n![Sync flow](drawings/sync-flow.excalidraw)\n\nAfter.\n');
  });
  it('turns a <!-- goals --> region into a collection block whose rows are goal nodes, and writes it back', () => {
    const src = 'Intro.\n\n<!-- goals -->\n- goal:g1 First goal #on-track (owner: alex, target: 2026-10)\n- goal:g2 Second goal\n<!-- /goals -->\n\nAfter.\n';
    const p = prepare(src);
    expect(p.md).toContain('%%COLLECTION:goal%%');
    const parsed: { type: string; content: { type: string; text: string; styles: object }[] }[] = [];
    for (const para of p.md.split(/\n\n+/).map(x => x.trim()).filter(Boolean)) {
      if (para.startsWith('- ')) for (const line of para.split('\n')) parsed.push({ type: 'bulletListItem', content: [t(line.replace(/^- /, ''))] });
      else parsed.push({ type: 'paragraph', content: [t(para)] });
    }
    const blocks = expand(parsed, p.yaml, p.drawings);
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'collection', 'paragraph']);
    expect(blocks[1].props).toEqual({ kind: 'goal' });
    expect(blocks[1].children?.map(c => c.type)).toEqual(['node', 'node']);
    expect(blocks[1].children?.[0].props).toMatchObject({ kind: 'goal', slug: 'g1', status: 'on-track', extra: 'owner: alex, target: 2026-10', row: 'goal', list: 'bullet' });
    expect(blocksToMarkdown(blocks)).toBe(src);
  });
  it('turns a <!-- table:bug --> region into a collection of that type, keeps camelCase keys, and writes it back', () => {
    setKinds(['bug']); // the product declares type:bug
    const src = 'Intro.\n\n<!-- table:bug -->\n- bug:login Login fails on Safari #open (severity: high, foundIn: 1.2)\n- bug:crash App crashes\n<!-- /table:bug -->\n\nAfter.\n';
    const p = prepare(src);
    expect(p.md).toContain('%%COLLECTION:bug%%');
    const parsed: { type: string; content: { type: string; text: string; styles: object }[] }[] = [];
    for (const para of p.md.split(/\n\n+/).map(x => x.trim()).filter(Boolean)) {
      if (para.startsWith('- ')) for (const line of para.split('\n')) parsed.push({ type: 'bulletListItem', content: [t(line.replace(/^- /, ''))] });
      else parsed.push({ type: 'paragraph', content: [t(para)] });
    }
    const blocks = expand(parsed, p.yaml, p.drawings);
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'collection', 'paragraph']);
    expect(blocks[1].props).toEqual({ kind: 'bug' });
    expect(blocks[1].children?.[0].props).toMatchObject({ kind: 'bug', slug: 'login', status: 'open', extra: 'severity: high, foundIn: 1.2', row: 'bug', list: 'bullet' });
    expect(blocksToMarkdown(blocks)).toBe(src);
  });
  it('turns a <!-- view:bug status=open --> line into a view block with the type and its filters, and writes it back', () => {
    const src = 'Intro.\n\n<!-- view:bug status=open group=owner -->\n\nAfter.\n';
    const p = prepare(src);
    expect(p.md).toContain('%%VIEW:0%%');
    expect(p.views).toEqual([{ slug: 'bug', query: 'status=open group=owner' }]);
    const blocks = expand(p.md.split(/\n\n+/).map(x => ({ type: 'paragraph', content: [t(x.trim())] })), p.yaml, p.drawings, p.images, p.views);
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'view', 'paragraph']);
    expect(blocks[1].props).toEqual({ slug: 'bug', query: 'status=open group=owner' });
    expect(blocksToMarkdown(blocks)).toBe(src);
    expect(blocksToMarkdown([{ type: 'view', props: { slug: 'page', query: '' } }])).toBe('<!-- view:page -->\n');
  });
  it('an image inside a node line is inline content of the node, and writes back into the line', () => {
    const src = 'bug:login Login fails ![shot](assets/a.png) on Safari #open\n\n![Standalone](assets/b.png)\n\n- task:t1 Do it\n  ![proof](assets/c.png)\n';
    const p = prepare(src);
    expect(p.images).toEqual([{ alt: 'shot', url: 'assets/a.png' }, { alt: 'proof', url: 'assets/c.png' }]);
    expect(p.md).toContain('![Standalone](assets/b.png)'); // a paragraph of its own stays an image block
    const parsed: { type: string; content?: { type: string; text: string; styles: object }[]; props?: Record<string, unknown> }[] = [];
    for (const para of p.md.split(/\n\n+/).map(x => x.trim()).filter(Boolean)) {
      if (para.startsWith('- ')) parsed.push({ type: 'bulletListItem', content: [t(para.replace(/^- /, ''))] });
      else if (para.startsWith('![')) parsed.push({ type: 'image', props: { url: 'assets/b.png', caption: 'Standalone' } });
      else parsed.push({ type: 'paragraph', content: [t(para)] });
    }
    const blocks = expand(parsed, p.yaml, p.drawings, p.images);
    expect(blocks.map(b => b.type)).toEqual(['node', 'image', 'node']);
    expect(blocks[0].content).toEqual([t('Login fails '), { type: 'img', props: { url: 'assets/a.png', alt: 'shot' } }, t(' on Safari')]);
    expect(blocks[2].content).toEqual([t('Do it '), { type: 'img', props: { url: 'assets/c.png', alt: 'proof' } }]);
    expect(blocksToMarkdown(blocks)).toBe('bug:login Login fails ![shot](assets/a.png) on Safari #open\n\n![Standalone](assets/b.png)\n\n- task:t1 Do it ![proof](assets/c.png)\n');
  });
  it('round-trips through the serializer', () => {
    const src = 'req:sale.close When done, entity:order is Closed. #proposed (owner: alex)\n\n---\n\n```yaml\n- id: rule:x\n  statement: S\n  source: f.ts\n```\n';
    const p = prepare(src);
    const parsed = p.md.split('\n\n').map(s => ({ type: 'paragraph', content: [t(s)] }));
    expect(blocksToMarkdown(expand(parsed, p.yaml))).toBe(src);
  });
});
