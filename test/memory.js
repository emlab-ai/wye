'use strict';
// Memory (module:memory-review): valid time and supersession (decision:memory.bitemporal), current-by-construction
// retrieval (req:memory.current-by-construction), the constraint packet (decision:memory.constraint-packet) and
// shapes on type cards (decision:memory.shapes).
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles } = require('../lib/parse');
const { Graph, isCurrent } = require('../lib/graph');

const md = `---
node: module:shop
title: Shop
---

# Shop

\`\`\`yaml
- id: decision:shop.old-pricing
  title: Prices are stored net
  date: 2026-01-10
  status: approved
  affects: [entity:shop.price]
- id: decision:shop.gross-pricing
  title: Prices are stored gross
  date: 2026-05-02
  status: approved
  supersedes: decision:shop.old-pricing
  affects: [entity:shop.price]
- id: decision:shop.future
  title: A decision that starts later
  since: 2999-01-01
  status: approved
- id: constraint:shop.local-first
  statement: The shop works offline; every write lands locally first
  status: approved
  scope: [entity:shop.price]
- id: constraint:shop.old
  statement: Retired constraint
  status: retired
- id: rule:shop.no-negative
  statement: A price is never negative
  source: lib/price.js:12
  governs: [entity:shop.price]
- id: entity:shop.price
  description: A price of a product
  fields: amount, currency
- id: goal:shop.launch
  title: Launch the shop
  status: on-track
- id: question:shop.rounding
  q: Half-up or bankers rounding on gross prices?
  status: open
  related-to: [entity:shop.price]
- id: question:shop.answered
  q: Already resolved
  status: resolved
  related-to: [entity:shop.price]
\`\`\`

req:shop.price-shown When a product is shown, its gross price is shown (satisfied-by: entity:shop.price, part-of: goal:shop.launch) #shipped

decision:shop.prose-old A prose decision that was superseded #superseded
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-memory-'));
fs.writeFileSync(path.join(dir, 'shop.md'), md);
const g = new Graph(parseFiles([path.join(dir, 'shop.md')]));

// --- supersession fills until and supersededBy on the old node, generated (never in the body)
const old = g.node('decision:shop.old-pricing');
assert.strictEqual(old.supersededBy, 'decision:shop.gross-pricing');
assert.strictEqual(old.until, '2026-05-02');
assert.ok(!/until:/.test(old.body), 'until is generated, not written');
assert.ok(g.data.edges.some(e => e.from === 'decision:shop.old-pricing' && e.verb === 'superseded-by' && e.to === 'decision:shop.gross-pricing' && e.generated), 'inverse superseded-by generated');

// --- isCurrent: status, supersession, valid time, as-of
assert.strictEqual(isCurrent(old), false);
assert.strictEqual(isCurrent(g.node('decision:shop.gross-pricing')), true);
assert.strictEqual(isCurrent(g.node('decision:shop.prose-old')), false, 'status superseded ends a node');
assert.strictEqual(isCurrent(g.node('constraint:shop.old')), false, 'status retired ends a node');
assert.strictEqual(isCurrent(g.node('decision:shop.future')), false, 'since in the future: not yet current');
assert.strictEqual(isCurrent(old, '2026-03-01'), true, 'as-of before until: current then');
assert.strictEqual(isCurrent(old, '2026-05-02'), false, 'as-of on until: ended');

// --- search hides ended nodes and counts them; --all shows them
const hits = g.search('pricing');
assert.ok(!hits.some(h => h.n.id === 'decision:shop.old-pricing'), 'superseded decision hidden from search');
assert.ok(hits.some(h => h.n.id === 'decision:shop.gross-pricing'));
assert.ok(hits.hidden >= 1, 'hidden counted');
assert.ok(g.search('pricing', { all: true }).some(h => h.n.id === 'decision:shop.old-pricing'), '--all shows it');
assert.ok(g.search('pricing', { asOf: '2026-03-01' }).some(h => h.n.id === 'decision:shop.old-pricing'), '--as-of shows what held then');
assert.ok(!g.packet('pricing').includes('## decision:shop.old-pricing'), 'packet skips ended nodes');

console.log('memory: ok');
