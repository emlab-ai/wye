import { describe, it, expect } from 'vitest';
import { readContent, writeContent } from './node-content';

const doc = `# T

req:a Text of a
wrapped.

  Inside a.

  - task:b Under a
    - deeper

Top.

- [ ] task:c Item c
  - sub of c
- [ ] task:d Item d

\`\`\`yaml
- id: req:x
  title: X
- id: req:y
  title: Y
\`\`\`

  Under y.

End.
`;

describe('readContent', () => {
  it('reads the content of a paragraph node, a list item and the last card of a fence, de-indented', () => {
    expect(readContent(doc, 'req:a', 3, 'prose')).toBe('Inside a.\n\n- task:b Under a\n  - deeper');
    expect(readContent(doc, 'task:b', 8, 'prose')).toBe('- deeper');
    expect(readContent(doc, 'task:c', 13, 'prose')).toBe('- sub of c');
    expect(readContent(doc, 'task:d', 15, 'prose')).toBe('');
    expect(readContent(doc, 'req:y', 17, 'yaml')).toBe('Under y.');
    expect(readContent(doc, 'req:x', 17, 'yaml')).toBe('');
  });
  it('finds the defining line when the given line is stale', () => {
    expect(readContent(doc, 'task:c', 1, 'prose')).toBe('- sub of c');
  });
});

describe('writeContent', () => {
  it('replaces a paragraph node\'s content, keeping its continuation text and what follows', () => {
    const out = writeContent(doc, 'req:a', 3, 'prose', 'New inside.\n\n- rule:r a rule');
    expect(out).toContain('req:a Text of a\nwrapped.\n\n  New inside.\n\n  - rule:r a rule\n\nTop.\n');
  });
  it('adds list content tight under an item and a blank line after paragraph content before the next item', () => {
    expect(writeContent(doc, 'task:d', 15, 'prose', '- sub of d')).toContain('- [ ] task:d Item d\n  - sub of d\n\n```yaml');
    const out = writeContent(doc, 'task:c', 13, 'prose', '- sub of c\n\nA note on c.');
    expect(out).toContain('- [ ] task:c Item c\n  - sub of c\n\n  A note on c.\n\n- [ ] task:d Item d\n');
  });
  it('removes content and keeps the blocks apart', () => {
    const out = writeContent(doc, 'req:a', 3, 'prose', '');
    expect(out).toContain('req:a Text of a\nwrapped.\n\nTop.\n');
  });
  it('writes a card\'s content after its fence and splits the fence for a card that is not last', () => {
    expect(writeContent(doc, 'req:y', 17, 'yaml', '- under y now')).toContain('  title: Y\n```\n\n  - under y now\n\nEnd.\n');
    const out = writeContent(doc, 'req:x', 17, 'yaml', 'Under x.')!;
    expect(out).toContain('- id: req:x\n  title: X\n```\n\n  Under x.\n\n```yaml\n- id: req:y\n  title: Y\n```\n\n  Under y.\n');
    expect(readContent(out, 'req:x', 17, 'yaml')).toBe('Under x.');
    expect(readContent(out, 'req:y', 17, 'yaml')).toBe('Under y.');
  });
  it('round-trips: writing what was read changes nothing', () => {
    for (const [id, line, form] of [['req:a', 3, 'prose'], ['task:c', 13, 'prose'], ['req:y', 17, 'yaml']] as const) expect(writeContent(doc, id, line, form, readContent(doc, id, line, form)!)).toBe(doc);
  });
});
