import { describe, it, expect } from 'vitest';
import { patchYamlCard, continuationEnd } from './node-edit';

const md = `# Doc

\`\`\`yaml
- id: rule:x
  statement: >
    Old statement, two
    lines long.
  source: f.ts
  status: proposed
- id: bug:y
  text: A bug
  priority: p2
\`\`\`
`;

describe('patchYamlCard', () => {
  it('sets a scalar key in place and adds a missing one at the end of the card', () => {
    const out = patchYamlCard(md, 'bug:y', { props: { priority: 'p1', owner: 'ana' } }).md;
    expect(out).toContain('- id: bug:y\n  text: A bug\n  priority: p1\n  owner: ana\n```');
  });
  it('removes a key with null and sets status', () => {
    const out = patchYamlCard(md, 'bug:y', { status: 'done', props: { priority: null } }).md;
    expect(out).toContain('- id: bug:y\n  text: A bug\n  status: done\n```');
  });
  it('writes a long or multi-line value as a folded block, replacing an existing block', () => {
    const out = patchYamlCard(md, 'rule:x', { props: { statement: 'New statement: with a colon\nand a second line' } }).md;
    expect(out).toContain('- id: rule:x\n  statement: >\n    New statement: with a colon\n    and a second line\n  source: f.ts\n  status: proposed\n- id: bug:y');
  });
  it('text edits the card\'s text key — statement here, text on the bug', () => {
    expect(patchYamlCard(md, 'rule:x', { text: 'Short.' }).md).toContain('- id: rule:x\n  statement: Short.\n  source: f.ts');
    expect(patchYamlCard(md, 'bug:y', { text: 'A worse bug' }).md).toContain('- id: bug:y\n  text: A worse bug\n  priority: p2');
  });
  it('reports a missing card', () => { expect(patchYamlCard(md, 'bug:nope', { status: 'done' }).error).toBe('not_found'); });
});

describe('continuationEnd', () => {
  it('joins wrapped lines of a prose node and stops at a blank, a list item, a fence or a comment', () => {
    expect(continuationEnd(['- task:a First', 'second line', 'third', '', 'para'], 0)).toBe(3);
    expect(continuationEnd(['- task:a First', '- task:b Next'], 0)).toBe(1);
    expect(continuationEnd(['task:a First', 'more', '```yaml', 'x'], 0)).toBe(2);
    expect(continuationEnd(['task:a First', '<!-- /tasks -->'], 0)).toBe(1);
  });
});
