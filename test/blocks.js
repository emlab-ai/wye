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
