import { describe, it, expect } from 'vitest';
import { blocksToMarkdown, inlineToMarkdown, nodeToMarkdown } from './serialize';
import type { AnyBlock } from './serialize';

const t = (text: string, styles: Record<string, unknown> = {}) => ({ type: 'text', text, styles });
const tag = (id: string) => ({ type: 'tag', props: { id } });

describe('inlineToMarkdown', () => {
  it('renders styles, tags and links', () => {
    expect(inlineToMarkdown([t('a '), t('b', { bold: true }), t(' '), t('c', { code: true }), t(' '), tag('rule:r'), t(' '), { type: 'link', href: 'entity:kitchen-item', content: [t('kitchen items')] }])).toBe('a **b** `c` rule:r [kitchen items](entity:kitchen-item)');
  });
});

describe('inline images', () => {
  it('writes an img inline item as a markdown image', () => {
    expect(inlineToMarkdown([{ type: 'text', text: 'Login fails ', styles: {} }, { type: 'img', props: { url: 'assets/a.png', alt: 'shot' } }, { type: 'text', text: ' on Safari', styles: {} }])).toBe('Login fails ![shot](assets/a.png) on Safari');
  });
});

describe('nodeToMarkdown', () => {
  it('writes a prose node with status and extra', () => {
    expect(nodeToMarkdown({ kind: 'req', slug: 'sale.close', status: 'proposed', form: 'prose', textKey: 'text', body: '', extra: 'owner: alex' }, 'When a sale closes, entity:order is Closed.')).toEqual(['req:sale.close When a sale closes, entity:order is Closed. #proposed (owner: alex)']);
  });
  it('rewrites only the text key and status inside a yaml body', () => {
    const body = 'id: req:m.a\ntitle: Old\nwhen: x\nstatus: proposed\nsatisfied-by: [rule:r1]';
    expect(nodeToMarkdown({ kind: 'req', slug: 'm.a', status: 'shipped', form: 'yaml', textKey: 'title', body, extra: '' }, 'New title')).toEqual(['id: req:m.a', 'title: New title', 'when: x', 'status: shipped', 'satisfied-by: [rule:r1]']);
  });
  it('keeps a status comment when the status is unchanged', () => {
    const body = 'id: req:c\ntitle: T\nstatus: shipped   # as a rule, not enforced';
    expect(nodeToMarkdown({ kind: 'req', slug: 'c', status: 'shipped', form: 'yaml', textKey: 'title', body, extra: '' }, 'T')).toEqual(['id: req:c', 'title: T', 'status: shipped   # as a rule, not enforced']);
    expect(nodeToMarkdown({ kind: 'req', slug: 'c', status: 'proposed', form: 'yaml', textKey: 'title', body, extra: '' }, 'T')[2]).toBe('status: proposed');
  });
  it('replaces a block scalar text key and adds a missing status', () => {
    const body = 'id: rule:r\nstatement: >\n  long\n  text\nsource: a.ts';
    expect(nodeToMarkdown({ kind: 'rule', slug: 'r', status: 'proposed', form: 'yaml', textKey: 'statement', body, extra: '' }, 'short')).toEqual(['id: rule:r', 'statement: short', 'source: a.ts', 'status: proposed']);
  });
});

describe('blocksToMarkdown', () => {
  it('writes drawings and images as image links', () => {
    expect(blocksToMarkdown([{ type: 'drawing', props: { src: 'drawings/a.excalidraw', title: 'A' } }, { type: 'image', props: { url: 'pic.png', caption: 'Pic' } }])).toBe('![A](drawings/a.excalidraw)\n\n![Pic](pic.png)\n');
  });
  it('numbers numbered items and numbered nodes in sequence', () => {
    const rule = (slug: string) => ({ type: 'node', props: { kind: 'rule', slug, status: '', form: 'prose', textKey: 'text', body: '', extra: '', check: '', list: 'number' }, content: [t('R ' + slug)] });
    const md = blocksToMarkdown([
      { type: 'numberedListItem', content: [t('one')] },
      { type: 'numberedListItem', content: [t('two')], children: [{ type: 'numberedListItem', content: [t('two a')] }, { type: 'numberedListItem', content: [t('two b')] }] },
      rule('x'), rule('y'),
      { type: 'paragraph', content: [t('break')] },
      rule('z'),
    ]);
    expect(md).toBe('1. one\n2. two\n  1. two a\n  2. two b\n3. rule:x R x\n4. rule:y R y\n\nbreak\n\n1. rule:z R z\n');
  });
  it('writes the children of a node block as nested list lines, nested nodes included', () => {
    const task = (slug: string, check: 'todo' | 'done', text: string, children?: AnyBlock[]) => ({ type: 'node', props: { kind: 'task', slug, status: check === 'done' ? 'done' : 'open', form: 'prose', textKey: 'text', body: '', extra: '', check, list: '' }, content: [t(text)], children });
    const md = blocksToMarkdown([
      task('a', 'todo', 'Build it', [
        { type: 'numberedListItem', content: [t('first step')] },
        { type: 'numberedListItem', content: [t('second step')], children: [{ type: 'bulletListItem', content: [t('detail')] }] },
        task('b', 'done', 'Sub task'),
        { type: 'paragraph', content: [t('a trailing note')] },
      ]),
      task('c', 'todo', 'Next'),
    ]);
    expect(md).toBe(`- [ ] task:a Build it
  1. first step
  2. second step
    - detail
  - [x] task:b Sub task

  a trailing note

- [ ] task:c Next
`);
  });
  it('writes content under a paragraph node and after a card\'s fence, indented, a blank line before a non-list first block', () => {
    const req = (slug: string, text: string, children?: AnyBlock[]) => ({ type: 'node', props: { kind: 'req', slug, status: '', form: 'prose', textKey: 'text', body: '', extra: '', check: '', list: '' }, content: [t(text)], children });
    const card = (slug: string, children?: AnyBlock[]) => ({ type: 'node', props: { kind: 'decision', slug, status: 'proposed', form: 'yaml', textKey: 'title', body: `id: decision:${slug}\ntitle: D ${slug}\nstatus: proposed`, extra: '' }, content: [t('D ' + slug)], children });
    const md = blocksToMarkdown([
      req('a', 'Text of a.', [
        { type: 'paragraph', content: [t('A paragraph inside a.')] },
        req('b', 'Inside a.', [{ type: 'bulletListItem', content: [t('two levels down')] }]),
        card('c', [{ type: 'paragraph', content: [t('under the inner card')] }]),
      ]),
      card('x'), card('y', [{ type: 'bulletListItem', content: [t('under y')] }, { type: 'paragraph', content: [t('and a paragraph')] }]), card('z'),
      { type: 'paragraph', content: [t('top again')] },
    ]);
    expect(md).toBe(`req:a Text of a.

  A paragraph inside a.

  req:b Inside a.
    - two levels down

  \`\`\`yaml
  - id: decision:c
    title: D c
    status: proposed
  \`\`\`

    under the inner card

\`\`\`yaml
- id: decision:x
  title: D x
  status: proposed
- id: decision:y
  title: D y
  status: proposed
\`\`\`

  - under y

  and a paragraph

\`\`\`yaml
- id: decision:z
  title: D z
  status: proposed
\`\`\`

top again
`);
  });
  it('serialises headings, paragraphs, lists, tables, code, dividers and nodes', () => {
    const md = blocksToMarkdown([
      { type: 'heading', props: { level: 2 }, content: [t('Section')] },
      { type: 'paragraph', content: [t('Hello '), tag('req:a'), t('.')] },
      { type: 'bulletListItem', content: [t('one')], children: [{ type: 'bulletListItem', content: [t('nested')] }] },
      { type: 'bulletListItem', content: [t('two')] },
      { type: 'table', content: { type: 'tableContent', rows: [{ cells: [[t('a')], [t('b')]] }, { cells: [[t('1')], [t('2')]] }, { cells: [[t('')], [t('')]] }] } },
      { type: 'codeBlock', props: { language: 'js' }, content: [t('x = 1\ny = 2')] },
      { type: 'divider' },
      { type: 'node', props: { kind: 'req', slug: 'p', status: '', form: 'prose', textKey: 'text', body: '', extra: '' }, content: [t('Prose req.')] },
      { type: 'node', props: { kind: 'req', slug: 'y1', status: 'proposed', form: 'yaml', textKey: 'title', body: 'id: req:y1\ntitle: Y1\nstatus: proposed', extra: '' }, content: [t('Y1')] },
      { type: 'node', props: { kind: 'rule', slug: 'y2', status: '', form: 'yaml', textKey: 'statement', body: 'id: rule:y2\nstatement: S\nsource: f.ts', extra: '' }, content: [t('S')] },
    ]);
    expect(md).toBe(`## Section

Hello req:a.

- one
  - nested
- two

| a | b |
|---|---|
| 1 | 2 |

\`\`\`js
x = 1
y = 2
\`\`\`

---

req:p Prose req.

\`\`\`yaml
- id: req:y1
  title: Y1
  status: proposed
- id: rule:y2
  statement: S
  source: f.ts
\`\`\`
`);
  });
});

describe('a list region keeps every card', () => {
  it('a yaml card without a title (its text) is written with its body and its content; an empty prose row is not', () => {
    const card = { type: 'node', props: { kind: 'req', slug: 'wf2.y', status: 'shipped', form: 'yaml', textKey: 'title', body: 'id: req:wf2.y\nstatus: shipped\nsatisfied-by: [lib:a]', extra: '' }, content: [{ type: 'text', text: '', styles: {} }], children: [{ type: 'node', props: { kind: 'when', slug: 'wf2.y', status: '', form: 'prose', textKey: 'text', extra: '', list: 'bullet' }, content: [{ type: 'text', text: 'a', styles: {} }] }] } as unknown as AnyBlock;
    const empty = { type: 'node', props: { kind: 'req', slug: '', status: '', form: 'prose', textKey: 'text', extra: '', row: 'req' }, content: [] } as unknown as AnyBlock;
    const md = blocksToMarkdown([{ type: 'collection', props: { kind: 'req', query: '', view: 'list' }, children: [card, empty] } as unknown as AnyBlock]);
    expect(md).toContain('- id: req:wf2.y\n  status: shipped\n  satisfied-by: [lib:a]');
    expect(md).toContain('  - when:wf2.y a');
    expect(md).not.toMatch(/- req: /);
  });
});
