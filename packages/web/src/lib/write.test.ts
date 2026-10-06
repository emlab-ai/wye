import { describe, it, expect } from 'vitest';
import { hashOf, replaceSegment, replaceChunk, appendChunk, insertYamlAfterSegment, patchFrontmatter, indentChunk, bodyOf, replaceBody, leadTitle, followHeading, renamePage } from './write';
import { splitDocument } from './doc';

const md = `---
node: module:m
title: Module M
status: proposed
---

# Module M

Intro.

---

## 1. Section

\`\`\`yaml
- id: req:m.a
  title: A
  when: x
- id: req:m.b
  title: B
\`\`\`

Tail text.
`;

describe('replaceSegment', () => {
  it('replaces exactly the markdown span and leaves the rest byte-identical', () => {
    const seg = splitDocument(md).segments[0]; if (seg.type !== 'markdown') throw new Error();
    const r = replaceSegment(md, 0, hashOf(seg.text), '# Module M\n\nNew intro.');
    expect(r.error).toBeUndefined();
    expect(r.md).toBe(md.replace('# Module M\n\nIntro.', '# Module M\n\nNew intro.'));
  });
  it('refuses a stale hash with the current text', () => {
    const r = replaceSegment(md, 0, 'stale', 'x');
    expect(r.error).toBe('conflict'); expect(r.current).toContain('Intro.');
  });
  it('refuses a bad index', () => { expect(replaceSegment(md, 9, 'x', 'y').error).toBe('not_found'); });
});

describe('replaceChunk', () => {
  it('re-indents a list-style chunk and replaces only it', () => {
    const seg = splitDocument(md).segments[3]; if (seg.type !== 'yaml') throw new Error();
    const r = replaceChunk(md, 3, 0, hashOf(seg.chunks[0].raw), 'id: req:m.a\ntitle: A2\nwhen: y\nthen: z');
    expect(r.error).toBeUndefined();
    expect(r.md).toContain('- id: req:m.a\n  title: A2\n  when: y\n  then: z\n- id: req:m.b\n  title: B\n```');
    expect(r.md).toContain('Tail text.');
  });
  it('keeps a non-list chunk unindented', () => {
    expect(indentChunk('id: x\nk: v', false)).toBe('id: x\nk: v');
    expect(indentChunk('id: x\nk: v\n  nested: 1', true)).toBe('- id: x\n  k: v\n    nested: 1');
  });
});

describe('appendChunk / insertYamlAfterSegment', () => {
  it('appends a chunk after the last chunk of a yaml block in the block style', () => {
    const r = appendChunk(md, 3, 'id: req:m.c\ntitle: C');
    expect(r.md).toContain('  title: B\n- id: req:m.c\n  title: C\n```');
  });
  it('inserts a new yaml block after a markdown segment', () => {
    const r = insertYamlAfterSegment(md, 0, 'id: rule:m.r\nstatement: s');
    expect(r.md).toContain('Intro.\n\n```yaml\nid: rule:m.r\nstatement: s\n```\n\n---');
  });
});

describe('patchFrontmatter', () => {
  it('updates existing keys and appends new ones inside the frontmatter', () => {
    const r = patchFrontmatter(md, { title: 'Renamed', owner: 'alex' });
    expect(r.md.startsWith('---\nnode: module:m\ntitle: Renamed\nstatus: proposed\nowner: alex\n---\n')).toBe(true);
  });
  it('refuses a file without frontmatter', () => { expect(patchFrontmatter('# no fm', { title: 'x' }).error).toBe('invalid'); });
});

describe('replaceBody', () => {
  it('keeps the frontmatter and swaps the body with a hash check', () => {
    const cur = bodyOf(md);
    const r = replaceBody(md, hashOf(cur), '# New\n\nbody\n');
    expect(r.md).toBe('---\nnode: module:m\ntitle: Module M\nstatus: proposed\n---\n\n# New\n\nbody\n');
    expect(replaceBody(md, 'stale', 'x').error).toBe('conflict');
  });
  it('a body that carries its own front matter is merged, not doubled: named keys win, the rest stays', () => {
    const cur = bodyOf(md);
    const r = replaceBody(md, hashOf(cur), '---\nnode: module:m\nstatus: analysed\nsource: import/x.md\n---\n\n# New\n\nbody\n');
    expect(r.md).toBe('---\nnode: module:m\ntitle: Module M\nstatus: analysed\nsource: import/x.md\n---\n\n# New\n\nbody\n');
  });
});

describe('a page is renamed where its title is read', () => {
  it('leadTitle is the heading the text opens with, as plain words', () => {
    expect(leadTitle(bodyOf(md))).toBe('Module M');
    expect(leadTitle('\n# A **bold** [link](x)\n\ntext')).toBe('A bold link');
    expect(leadTitle('Intro.\n\n# Later')).toBeNull();
    expect(leadTitle('## Not the title')).toBeNull();
  });
  it('followHeading: a changed opening heading becomes the title', () => {
    const after = md.replace('# Module M', '# Module N');
    expect(followHeading(md, after)).toContain('title: Module N');
    expect(bodyOf(followHeading(md, after))).toBe(bodyOf(after));
  });
  it('followHeading: an edit that leaves the heading alone leaves the title alone', () => {
    const other = md.replace('title: Module M', 'title: Something else');
    const after = other.replace('Intro.', 'Intro, longer.');
    expect(followHeading(other, after)).toBe(after);
    expect(followHeading(md, md.replace('# Module M\n', ''))).toContain('title: Module M');   // heading removed: the title stays
  });
  it('renamePage sets the title and the heading the text opens with', () => {
    const r = renamePage(md, '  Module Z ');
    expect(r.md).toContain('title: Module Z');
    expect(r.md).toContain('\n# Module Z\n');
    expect(r.md).not.toContain('Module M');
    expect(renamePage(md, ' ').error).toBe('invalid');
    const bare = md.replace('# Module M\n\n', '');
    expect(bodyOf(renamePage(bare, 'Z').md)).toBe(bodyOf(bare));
  });
});
