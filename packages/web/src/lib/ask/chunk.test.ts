import { describe, it, expect } from 'vitest';
import { nodeChunks, docChunks, codeChunks, sessionChunks, mentionedIds } from './chunk';
import { blockHash } from '../anchors';
import type { GraphData } from '../graph';

const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, edges: [], nodes: [
  { id: 'req:a', kind: 'req', title: 'Login works', status: 'shipped', section: '', subsection: '', body: 'id: req:a\ntitle: Login works\nthen: the person is signed in', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 3 },
  { id: 'block:x', kind: 'block', title: '', status: '', section: '', subsection: '', body: '', defined: true, file: '', line: 0 },
  { id: 'req:undef', kind: 'req', title: '', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 },
  { id: 'module:m', kind: 'module', title: 'M', status: '', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1 },
] } as unknown as GraphData;

describe('nodeChunks', () => {
  it('keeps defined, visible, non-page nodes with their prose', () => {
    const c = nodeChunks(g);
    expect(c.map(x => x.id)).toEqual(['node:req:a']);
    expect(c[0]).toMatchObject({ source: 'node', ref: 'req:a', title: 'Login works', nodes: ['req:a'] });
    expect(c[0].text).toContain('signed in');
  });
});

const DOC = `---
node: module:m
title: M
---

# Shell

Intro paragraph about search and req:a.

\`\`\`yaml
- id: req:a
  title: Login works
\`\`\`

## Why

<!-- list:req -->

Because people asked.

Second paragraph.
`;
describe('docChunks', () => {
  const c = docChunks('data/products/p/projects/v2/docs/m.md', DOC);
  it('splits by heading, drops yaml cards, comments and frontmatter', () => {
    expect(c.map(x => x.title)).toEqual(['M › Shell', 'M › Why']);
    expect(c.some(x => x.text.includes('- id:'))).toBe(false);
    expect(c.some(x => x.text.includes('list:req'))).toBe(false);
    expect(c.some(x => x.text.includes('node: module'))).toBe(false);
  });
  it('refs the first paragraph block so a citation opens it', () => {
    expect(c[0].ref).toBe(`v2/m#b-${blockHash('Intro paragraph about search and req:a.')}`);
    expect(c[0].id).toBe('doc:' + c[0].ref);
  });
  it('records the node ids a passage mentions', () => { expect(c[0].nodes).toEqual(['req:a']); });
  it('splits a long section on paragraph boundaries at ~1200 chars', () => {
    const long = `# T\n\n${'a'.repeat(900)}\n\n${'b'.repeat(900)}\n`;
    const parts = docChunks('data/products/p/projects/v2/docs/t.md', long);
    expect(parts.length).toBe(2);
    expect(parts[1].ref).toBe(`v2/t#b-${blockHash('b'.repeat(900))}`);
  });
  it('maps .wye system pages to ~slugs', () => {
    expect(docChunks('data/products/p/projects/v2/.wye/goals.md', '# G\n\ntext here\n')[0].ref).toMatch(/^v2\/~goals#b-/);
  });
});

describe('codeChunks', () => {
  it('splits at top-level symbols with line ranges', () => {
    const src = `import x from 'y';\n\nexport function alpha() {\n  return 1;\n}\n\nexport const beta = () => 2;\n`;
    const c = codeChunks('lib/a.ts', src);
    expect(c.map(x => x.ref)).toEqual(['lib/a.ts:1-2', 'lib/a.ts:3-6', 'lib/a.ts:7-7']);
    expect(c[1].title).toBe('lib/a.ts › alpha');
  });
  it('falls back to 60-line windows', () => {
    const c = codeChunks('notes.txt', Array.from({ length: 130 }, (_, i) => `line ${i}`).join('\n'));
    expect(c.map(x => x.ref)).toEqual(['notes.txt:1-60', 'notes.txt:61-120', 'notes.txt:121-130']);
  });
  it('splits an oversized symbol into windows', () => {
    const body = Array.from({ length: 150 }, () => '  x++;').join('\n');
    const c = codeChunks('big.ts', `function big() {\n${body}\n}\n`);
    expect(c.length).toBe(3); expect(c[0].ref).toBe('big.ts:1-60');
  });
  it('skips blank-only pieces', () => { expect(codeChunks('e.ts', '\n\n\n')).toEqual([]); });
});

describe('sessionChunks', () => {
  it('one chunk per turn: instruction, assistant text, result', () => {
    const c = sessionChunks({ id: 'abc123', instruction: 'Fix the invite flow', result: 'Done: invite email removed',
      log: [{ t: '', line: 'started' }], transcript: [{ t: '', kind: 'assistant', text: 'Reading lib/invite.ts' }, { t: '', kind: 'tool_use', name: 'Read' }] } as never);
    expect(c.map(x => x.ref)).toEqual(['abc123#0', 'abc123#1', 'abc123#2']);
    expect(c[0].title).toBe('Session abc123 · Fix the invite flow');
    expect(c[2].text).toContain('invite email removed');
  });
});

describe('mentionedIds', () => {
  it('finds kind:slug ids, not urls or times', () => {
    expect(mentionedIds('see req:a.b and decision:wf2.x, http://x.y and 10:30')).toEqual(['req:a.b', 'decision:wf2.x']);
  });
});
