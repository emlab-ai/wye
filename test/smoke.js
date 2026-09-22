'use strict';
// Smoke test: parse the inventory pilot (if present) and assert the graph has the expected shape.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const pilot = process.env.PILOT || (process.env.HOME ? path.join(process.env.HOME, 'Projects/yessensei/src/docs/context-graph/inventory.md') : '');
if (!fs.existsSync(pilot)) { console.log('skip: pilot not found at ' + pilot); process.exit(0); }
process.chdir(path.dirname(path.dirname(path.dirname(pilot))));
const g = new Graph(parseFiles([pilot]));
const s = g.stats();
assert(s.byKind.req.defined >= 50, 'reqs parsed');
assert(s.byKind.rule.defined >= 40, 'rules parsed');
assert(s.byKind.field.defined >= 100, 'fields generated');
assert(s.byVerb['satisfied-by'] > 100 && s.byVerb['verified-by'] > 100 && s.byVerb.refines > 20, 'typed edges');
const r = g.node('req:inv.sale.shortfall.oversell');
assert(r && r.status === 'shipped' && r.title.includes('oversell'), 'req title/status');
assert((g.out.get(r.id) || []).some(e => e.verb === 'refines' && e.to === 'req:inv.sale.shortfall'), 'refines edge');
const f = g.node('field:inventory-batch.receivedQuantity');
assert(f && (g.inc.get(f.id) || []).filter(e => e.verb === 'mentions').length >= 3, 'field mentions');
assert(g.impact('field:inventory-batch.receivedQuantity').size >= 3, 'impact');
assert(g.packet('oversell negative inventory', { budget: 3000 }).includes('req:inv.sale.shortfall'), 'packet');
const c = g.check({ repo: process.cwd() });
assert(c.ok, 'check ok: ' + c.errors.join('; '));
console.log(`ok — ${s.nodes} nodes, ${s.edges} edges, ${c.warnings.length} warnings`);
