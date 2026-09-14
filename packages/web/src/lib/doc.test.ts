import { describe, it, expect } from 'vitest';
import { docSlug, splitDocument, outline, headingSlug, documentTree, linkedDocuments, nodeIndex } from './doc';
import { indexGraph, type GraphData } from './graph';

const md = `---
node: module:m
title: Module M
status: proposed
---

# Module M

Intro text mentions rule:r1.

## 1. Section

\`\`\`yaml
- id: req:m.a
  title: A
  when: x
  then: y
- id: req:m.b
  title: B
\`\`\`

### 1.1 Sub

| op | args | does |
|---|---|---|
| op:o | a | does it |

\`\`\`yaml
just: config
\`\`\`
`;

describe('splitDocument', () => {
  it('parses frontmatter and alternates markdown and yaml segments', () => {
    const d = splitDocument(md);
    expect(d.frontmatter.title).toBe('Module M');
    expect(d.frontmatter.node).toBe('module:m');
    expect(d.segments.map(s => s.type)).toEqual(['markdown', 'yaml', 'markdown', 'yaml']);
    const y = d.segments[1]; if (y.type !== 'yaml') throw new Error();
    expect(y.chunks.map(c => c.id)).toEqual(['req:m.a', 'req:m.b']);
    expect(y.chunks[0].body).toBe('id: req:m.a\ntitle: A\nwhen: x\nthen: y');
    const cfg = d.segments[3]; if (cfg.type !== 'yaml') throw new Error();
    expect(cfg.chunks).toEqual([{ id: null, body: 'just: config' }]);
  });
  it('drops the frontmatter from the first markdown segment', () => {
    const d = splitDocument(md);
    const first = d.segments[0]; if (first.type !== 'markdown') throw new Error();
    expect(first.text.startsWith('# Module M')).toBe(true);
  });
});

describe('outline', () => {
  it('lists ## and ### headings with slugs', () => {
    expect(outline(md)).toEqual([{ level: 2, text: '1. Section', slug: '1-section' }, { level: 3, text: '1.1 Sub', slug: '1-1-sub' }]);
    expect(headingSlug('R. Requirements (behaviour)')).toBe('r-requirements-behaviour');
  });
});

const n = (id: string, file: string, title = id, extra: Partial<{ defined: boolean; status: string }> = {}) => ({ id, kind: id.split(':')[0], title, status: extra.status ?? '', section: '', subsection: '', body: '', defined: extra.defined ?? true, file, line: 1 });
const g: GraphData = {
  generatedAt: '', fieldIndex: {},
  files: ['docs/context-graph/project.md', 'docs/context-graph/prd.md', 'docs/context-graph/old.md'],
  modules: [
    { id: 'module:wf2', title: 'Project', file: 'docs/context-graph/project.md', verified: '', sourceRoots: [] },
    { id: 'module:wf2-prd', title: 'PRD', file: 'docs/context-graph/prd.md', verified: '', sourceRoots: [] },
    { id: 'module:old', title: 'Old', file: 'docs/context-graph/old.md', verified: '', sourceRoots: [] },
  ],
  nodes: [
    n('module:wf2', 'docs/context-graph/project.md', 'Project'), n('module:wf2-prd', 'docs/context-graph/prd.md', 'PRD'), n('module:old', 'docs/context-graph/old.md', 'Old'),
    n('req:wf2.a', 'docs/context-graph/prd.md', 'A', { status: 'proposed' }), n('rule:r', 'docs/context-graph/old.md', 'R'),
    n('field:e.x', 'docs/context-graph/old.md'), n('test:t', '', 't', { defined: false }),
  ],
  edges: [
    { from: 'module:wf2', to: 'module:wf2-prd', verb: 'has' },
    { from: 'req:wf2.a', to: 'rule:r', verb: 'satisfied-by' },
    { from: 'req:wf2.a', to: 'test:t', verb: 'verified-by' },
  ],
};

describe('documentTree', () => {
  it('builds roots from module has-edges and picks the main root', () => {
    const t = documentTree(g);
    expect(t.roots.map(r => r.slug)).toEqual(['project', 'old']);
    expect(t.roots[0].children.map(c => c.slug)).toEqual(['prd']);
    expect(t.main?.slug).toBe('project');
    expect(t.byFile.get('docs/context-graph/prd.md')?.title).toBe('PRD');
  });
});

describe('linkedDocuments', () => {
  it('lists other files reached by edges in either direction with counts', () => {
    const idx = indexGraph(g);
    expect(linkedDocuments(g, idx, 'docs/context-graph/prd.md')).toEqual([{ file: 'docs/context-graph/old.md', slug: 'old', title: 'Old', count: 1 }]);
    expect(linkedDocuments(g, idx, 'docs/context-graph/old.md')).toEqual([{ file: 'docs/context-graph/prd.md', slug: 'prd', title: 'PRD', count: 1 }]);
  });
});

describe('nodeIndex', () => {
  it('indexes every non-field node compactly', () => {
    const ix = nodeIndex(g);
    expect(ix['req:wf2.a']).toEqual({ id: 'req:wf2.a', kind: 'req', title: 'A', status: 'proposed', defined: true, file: 'docs/context-graph/prd.md' });
    expect(ix['field:e.x']).toBeUndefined();
    expect(ix['test:t'].defined).toBe(false);
  });
  it('docSlug strips directory and extension', () => { expect(docSlug('docs/context-graph/dev-design.md')).toBe('dev-design'); });
});
