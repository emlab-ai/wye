'use strict';
// Every block is a node: anonymous paragraphs, headings, list items, tables and fences become block:<doc>.<hash>
// nodes (hash = the web's anchor hash), the document has its headings, a heading has its blocks, a list item has
// its nested items; a named node is its own block; a phrase link in plain prose is the block's edge.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles, blockHash } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const md = `---
node: module:pos
title: POS
---

# POS

Intro paragraph that [links a phrase](entity:kitchen-item) from plain prose,
wrapped onto a second line.

## Sales

A plain paragraph under Sales.

- first item
  - nested item
- req:sale.void A sale can be voided until it is closed. #shipped

\`\`\`yaml
- id: rule:close
  statement: closes
  source: a.js:1
\`\`\`

\`\`\`
code fence
\`\`\`

| a | b |
|---|---|
| 1 | 2 |
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-blocks-'));
const file = path.join(dir, 'pos.md');
fs.writeFileSync(file, md);
const data = parseFiles([file]);
const g = new Graph(data);
const out = id => (g.out.get(id) || []).filter(e => !e.generated).map(e => e.verb + '>' + e.to).sort();

assert.strictEqual(blockHash('**Intro** paragraph'), blockHash('intro paragraph'), 'hash ignores decoration and case');
const intro = 'block:pos.' + blockHash('Intro paragraph that [links a phrase](entity:kitchen-item) from plain prose,\nwrapped onto a second line.');
const n = g.node(intro);
assert(n && n.defined && n.kind === 'block', 'intro paragraph is a block node: ' + intro);
assert.strictEqual(n.line, 8, 'block line is the paragraph start');
assert(n.title.startsWith('Intro paragraph that links a phrase'), 'title is the plain text: ' + n.title);
assert(/^text: Intro paragraph/m.test(n.body), 'body carries the text');
assert(out(intro).includes('related-to>entity:kitchen-item'), 'phrase link is the block\'s edge: ' + out(intro));
assert(!out('module:pos').includes('related-to>entity:kitchen-item'), 'and no longer the document\'s');

const h1 = 'block:pos.' + blockHash('# POS'), h2 = 'block:pos.' + blockHash('## Sales');
assert(g.node(h2) && g.node(h2).kind === 'block', 'heading is a block');
assert(out('module:pos').includes('has>' + h1), 'document has its h1');
assert(out(h1).includes('has>' + intro) && out(h1).includes('has>' + h2), 'h1 has the intro and the h2: ' + out(h1));
const para = 'block:pos.' + blockHash('A plain paragraph under Sales.');
assert(out(h2).includes('has>' + para), 'heading has its paragraph');
const first = 'block:pos.' + blockHash('first item'), nested = 'block:pos.' + blockHash('nested item');
assert(out(h2).includes('has>' + first) && out(first).includes('has>' + nested), 'list item has its nested item: ' + out(first));
assert(out(h2).includes('has>req:sale.void'), 'a named node is its own block, child of the heading: ' + out(h2));
assert(!g.node('block:pos.' + blockHash('req:sale.void A sale can be voided until it is closed. #shipped')), 'no block node for a prose node');
assert(out(h2).includes('has>rule:close'), 'yaml cards are the fence\'s blocks');
const fence = 'block:pos.' + blockHash('```\ncode fence\n```'), table = 'block:pos.' + blockHash('| a | b |\n|---|---|\n| 1 | 2 |');
assert(g.node(fence) && g.node(table), 'code fence and table are blocks');
assert(g.node(fence).part === 'module:pos' || (g.out.get(fence) || []).some(e => e.generated && e.verb === 'part-of' && e.to === h2), 'generated part-of reaches the heading');

// hidden by default
assert(!g.search('plain paragraph').some(h => h.n.kind === 'block'), 'search hides blocks');
assert(g.search('block:pos plain').some(h => h.n.kind === 'block'), 'search shows blocks when asked for block:');
assert(data.nodes.filter(x => x.kind === 'block').length === 8, 'eight anonymous blocks: ' + data.nodes.filter(x => x.kind === 'block').map(x => x.title).join(' | '));
console.log('ok — blocks: nodes, tree, owned links, hidden');

// ---- content (req:ontology.content, decision:ontology.content-markdown): the blocks indented under a node's defining
// line — a named paragraph, a list item, a yaml card's closing fence — are its content, at any depth
const md2 = `---
node: module:cnt
title: Content
---

# Content

## Forms

req:cnt.para A paragraph node whose text
wraps onto a continuation line.

  A paragraph inside the node.

  - a list item inside the node
    - two levels down

  \`\`\`yaml
  - id: decision:cnt.inner
    title: Inner
  \`\`\`

Back at the top level.

- task:cnt.item An item with content

  Paragraph under the item.

  - question:cnt.q Nested question? #open

    \`\`\`yaml
    - id: rule:cnt.deep
      statement: three levels down
      source: a.js:1
    \`\`\`

\`\`\`yaml
- id: req:cnt.card
  title: A card with content
\`\`\`

  Under the card.

  - rule:cnt.under A rule under the card #proposed

Plain again.
`;
const file2 = path.join(dir, 'cnt.md');
fs.writeFileSync(file2, md2);
const g2 = new Graph(parseFiles([file2]));
const out2 = id => (g2.out.get(id) || []).filter(e => !e.generated).map(e => e.verb + '>' + e.to).sort();
const bid = t => 'block:cnt.' + blockHash(t);
const forms = bid('## Forms');
assert.strictEqual(g2.node('req:cnt.para').body.split('\n')[1], 'text: A paragraph node whose text wraps onto a continuation line.', 'continuation lines stay the text');
assert(out2(forms).includes('has>req:cnt.para'), 'the named paragraph is the heading\'s block');
// a table region's marker comment sits right before its first row: the row still opens a container for its content
{
  const md3 = '---\nnode: module:tbl\ntitle: T\n---\n\n# T\n\n<!-- table:task -->\n- [ ] task:tbl.row A row with content\n\n  # Subtasks\n\n  - [ ] task:tbl.sub A subtask\n<!-- /table:task -->\n';
  const f3 = path.join(dir, 'tbl.md'); fs.writeFileSync(f3, md3);
  const g3 = new Graph(parseFiles([f3]));
  const out3 = id => (g3.out.get(id) || []).filter(e => !e.generated).map(e => e.verb + '>' + e.to).sort();
  assert(out3('task:tbl.row').includes('has>task:tbl.sub'), 'the subtask under a table row is the row\'s content: ' + out3('task:tbl.row'));
  assert(out3('task:tbl.row').includes('has>block:tbl.' + blockHash('# Subtasks')), 'an indented heading is a block of the row\'s content');
  assert(!g3.data.nodes.some(n => /table:task/.test(n.title || '')), 'the marker comment is not a block');
}
assert(out2('req:cnt.para').includes('has>' + bid('A paragraph inside the node.')), 'an indented paragraph after a blank line is the node\'s content: ' + out2('req:cnt.para'));
assert(out2('req:cnt.para').includes('has>' + bid('a list item inside the node')), 'an indented list item is the node\'s content');
assert(out2(bid('a list item inside the node')).includes('has>' + bid('two levels down')), 'nesting continues inside the content');
assert(g2.node('decision:cnt.inner') && g2.node('decision:cnt.inner').defined, 'an indented yaml card inside content defines its node');
assert(out2('req:cnt.para').includes('has>decision:cnt.inner'), 'the indented card is the node\'s content');
assert(!out2(forms).includes('has>' + bid('A paragraph inside the node.')), 'content is not the heading\'s');
assert(out2(forms).includes('has>' + bid('Back at the top level.')), 'a top-level paragraph closes the content');
assert(out2('task:cnt.item').includes('has>' + bid('Paragraph under the item.')) && out2('task:cnt.item').includes('has>question:cnt.q'), 'a list item\'s content: paragraph and nested typed item: ' + out2('task:cnt.item'));
assert(out2('question:cnt.q').includes('has>rule:cnt.deep'), 'a card three levels down is the nested item\'s content: ' + out2('question:cnt.q'));
assert.strictEqual(g2.node('rule:cnt.deep').title, 'three levels down', 'the nested card\'s body is de-indented');
assert(out2(forms).includes('has>req:cnt.card'), 'the top-level card is the heading\'s block');
assert(out2('req:cnt.card').includes('has>' + bid('Under the card.')) && out2('req:cnt.card').includes('has>rule:cnt.under'), 'the indented blocks after a card\'s fence are its content: ' + out2('req:cnt.card'));
assert.strictEqual(g2.node('rule:cnt.under').status, 'proposed', 'a typed line inside content is a prose node');
assert(out2(forms).includes('has>' + bid('Plain again.')), 'the content ends at the next top-level block');
console.log('ok — content: indented blocks under a paragraph node, a list item and a card, three levels deep');

// a req's parts written right under its line, no blank line between: they are that req's, not the previous one's
{
  const md4 = '---\nnode: module:prt\ntitle: P\n---\n\n# P\n\nreq:prt.a First. #proposed\n  - when:prt.a a happens\n  - then:prt.a a shows\n\nreq:prt.a.b Second. #proposed\n  - when:prt.a.b b happens\n\nAfter.\n';
  const f4 = path.join(dir, 'prt.md'); fs.writeFileSync(f4, md4);
  const g4 = new Graph(parseFiles([f4]));
  const out4 = id => (g4.out.get(id) || []).filter(e => !e.generated).map(e => e.verb + '>' + e.to).sort();
  assert.deepStrictEqual(out4('req:prt.a').filter(e => e.startsWith('has>')), ['has>then:prt.a', 'has>when:prt.a'], 'the first req has its own parts: ' + out4('req:prt.a'));
  assert.deepStrictEqual(out4('req:prt.a.b').filter(e => e.startsWith('has>')), ['has>when:prt.a.b'], 'the second req has its own part: ' + out4('req:prt.a.b'));
  assert(/^when: b happens$/m.test(g4.node('req:prt.a.b').body), 'the part\'s text is read back as the key');
  assert(out4('block:prt.' + blockHash('# P')).includes('has>req:prt.a.b') && out4('block:prt.' + blockHash('# P')).includes('has>' + 'block:prt.' + blockHash('After.')), 'the heading still has the reqs and the paragraph after');
}
console.log('ok — parts right under a prose node are its content');
