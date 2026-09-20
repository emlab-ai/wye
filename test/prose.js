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
const out = (g.out.get('req:sale.close') || []).filter(e => !e.generated).map(e => e.verb + '>' + e.to).sort();
assert.deepStrictEqual(out, ['refines>req:sale', 'related-to>entity:kitchen-item', 'related-to>entity:order', 'satisfied-by>rule:close-on-complete', 'verified-by>test:sales'].sort(), 'edges: ' + out.join(', '));

const v = g.node('req:sale.void'); assert(v && v.defined && v.status === 'shipped', 'list-item prose node with alias');
const rule = g.node('rule:close-on-complete'); assert(rule && rule.defined, 'prose rule defined');
assert((g.out.get('rule:close-on-complete') || []).some(e => e.verb === 'see' && e.to === 'rule:kitchen-done'), 'see verb inferred');
assert(!(g.out.get('module:pos') || []).some(e => e.to === 'req:sale.close' && e.verb === 'related-to'), 'a plain mention is not a link');
// a plain-prose link is owned by its block; the document reaches it through has → block (h1) → block
const reach = (id, depth) => depth < 0 ? [] : (g.out.get(id) || []).flatMap(e => e.verb === 'has' ? [e.to, ...reach(e.to, depth - 1)] : []);
assert(reach('module:pos', 3).some(b => (g.out.get(b) || []).some(e => e.verb === 'related-to' && e.to === 'entity:kitchen-item')), 'plain-prose link is a block\'s edge under the document');
const t1 = g.node('task:kitchen-screen'); assert(t1 && t1.defined && t1.status === 'open', 'unchecked task is open: ' + (t1 && t1.status));
assert((g.out.get('task:kitchen-screen') || []).some(e => e.verb === 'part-of' && e.to === 'req:sale.close'), 'task part-of inferred');
const t2 = g.node('task:wire-order'); assert(t2 && t2.status === 'done', 'checked task is done');
assert((g.out.get('module:pos') || []).some(e => e.verb === 'part-of' && e.to === 'module:root'), 'frontmatter part-of is an edge');
const y = g.node('req:sale'); assert(y && y.defined && y.title === 'Sales', 'yaml nodes still parse');
console.log('ok — prose nodes: ' + g.stats().nodes + ' nodes');

// an html comment right after a prose node line ends the node's text (goals/tasks tables close with <!-- /tasks -->)
{
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-prose-'));
  fs.writeFileSync(path.join(dir, 'a.md'), '---\nnode: module:a\ntitle: A\n---\n\n<!-- tasks -->\n- [x] task:t1 Do it (session: abc, produced: module:b)\n<!-- /tasks -->\n');
  const { parseFiles } = require('../lib/parse');
  const g = parseFiles([path.join(dir, 'a.md')], dir);
  const t = g.nodes.find(n => n.id === 'task:t1');
  assert(t && /^text: Do it$/m.test(t.body), 'comment must not join the task text: ' + (t && t.body));
  assert(/^session: abc$/m.test(t.body) && /^produced: module:b$/m.test(t.body), 'trailing props parsed: ' + t.body);
  assert(g.edges.some(e => e.from === 'task:t1' && e.to === 'module:b' && e.verb === 'produced'), 'produced edge');
  console.log('ok prose: html comment ends a prose node');
}

// trailing props: a comma inside [] separates list items, not keys — an id like rule:x is not a key
{
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-prose-'));
  fs.writeFileSync(path.join(dir, 'a.md'), '---\nnode: module:a\ntitle: A\n---\n\n- req:r1 The thing happens #shipped (refines: [req:r0], related-to: [req:r2, rule:live-refresh], owner: alex)\n');
  const { parseFiles } = require('../lib/parse');
  const g = parseFiles([path.join(dir, 'a.md')], dir);
  const r = g.nodes.find(n => n.id === 'req:r1');
  assert(r && /^related-to: \[req:r2, rule:live-refresh\]$/m.test(r.body) && /^owner: alex$/m.test(r.body), 'list prop kept whole: ' + (r && r.body));
  assert(g.edges.some(e => e.from === 'req:r1' && e.to === 'rule:live-refresh' && e.verb === 'related-to'), 'second list item is an edge');
  console.log('ok prose: an id list in trailing props keeps its commas');
}
