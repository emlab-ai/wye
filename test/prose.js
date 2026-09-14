'use strict';
// Prose nodes: a paragraph or list item that starts with an id defines a node; links and ids in its text are edges.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles, cleanId, inferVerb } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const md = `---
node: module:pos
title: POS
part-of: module:root
---

# POS

Intro paragraph that [links a phrase](entity:kitchen-item) from plain prose.

## R. Requirements

req:sale.close When a sale is completed and all [kitchen items](entity:kitchen-item) are completed, et:order must be
marked as Closed. Satisfied by rule:close-on-complete and verified by test:sales#close. #proposed (refines: req:sale, owner: alex)

- rq:sale.void A sale can be voided until it is closed. #shipped
- [ ] task:kitchen-screen Build the kitchen screen, part of req:sale.close.
- [x] tk:wire-order Wire et:order to the kitchen. #done
- rule:close-on-complete The order status becomes Closed only when every kitchen item is done; see rule:kitchen-done.

Plain paragraph mentioning req:sale.close is not a definition.

\`\`\`yaml
- id: req:sale
  title: Sales
  when: x
  then: y
  status: shipped
  satisfied-by: [rule:close-on-complete]
\`\`\`
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-prose-'));
const file = path.join(dir, 'pos.md');
fs.writeFileSync(file, md);
const g = new Graph(parseFiles([file]));

assert.strictEqual(cleanId('et:order'), 'entity:order', 'alias expands');
assert.strictEqual(inferVerb('all things are satisfied by'), 'satisfied-by');
assert.strictEqual(inferVerb('and then'), 'related-to');

const r = g.node('req:sale.close');
assert(r && r.defined, 'prose req defined');
assert.strictEqual(r.status, 'proposed', 'status from hashtag');
assert(r.title.startsWith('When a sale is completed'), 'title is first sentence: ' + r.title);
assert(/^text: When a sale/m.test(r.body) && /^owner: alex$/m.test(r.body), 'body has text and extra keys');
const out = (g.out.get('req:sale.close') || []).map(e => e.verb + '>' + e.to).sort();
assert.deepStrictEqual(out, ['refines>req:sale', 'related-to>entity:kitchen-item', 'related-to>entity:order', 'satisfied-by>rule:close-on-complete', 'verified-by>test:sales'].sort(), 'edges: ' + out.join(', '));

const v = g.node('req:sale.void'); assert(v && v.defined && v.status === 'shipped', 'list-item prose node with alias');
const rule = g.node('rule:close-on-complete'); assert(rule && rule.defined, 'prose rule defined');
assert((g.out.get('rule:close-on-complete') || []).some(e => e.verb === 'see' && e.to === 'rule:kitchen-done'), 'see verb inferred');
assert(!(g.out.get('module:pos') || []).some(e => e.to === 'req:sale.close' && e.verb === 'related-to'), 'a plain mention is not a link');
assert((g.out.get('module:pos') || []).some(e => e.verb === 'related-to' && e.to === 'entity:kitchen-item'), 'plain-prose link relates the document');
const t1 = g.node('task:kitchen-screen'); assert(t1 && t1.defined && t1.status === 'open', 'unchecked task is open: ' + (t1 && t1.status));
assert((g.out.get('task:kitchen-screen') || []).some(e => e.verb === 'part-of' && e.to === 'req:sale.close'), 'task part-of inferred');
const t2 = g.node('task:wire-order'); assert(t2 && t2.status === 'done', 'checked task is done');
assert((g.out.get('module:pos') || []).some(e => e.verb === 'part-of' && e.to === 'module:root'), 'frontmatter part-of is an edge');
const y = g.node('req:sale'); assert(y && y.defined && y.title === 'Sales', 'yaml nodes still parse');
console.log('ok — prose nodes: ' + g.stats().nodes + ' nodes');
