'use strict';
// Impact (decision:exec.impact-run, req:exec.impact-set, req:exec.impact-sub-items): structural candidates with
// paths and decay, content first, verbatim repeats patched without a call, and the judged run through a fake judge.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');
const impact = require('../lib/impact');

const md = `---
node: module:shop
title: Shop
---

# Shop

\`\`\`yaml
- id: req:shop.checkout
  title: Checkout takes a card
  when: the buyer pays
  then: the card is charged in one step
  status: approved
  satisfied-by: [rule:shop.charge]
  verified-by: [test:shop.checkout]
- id: req:shop.checkout.retry
  title: A failed charge is retried once
  refines: req:shop.checkout
  status: proposed
- id: rule:shop.charge
  statement: The card is charged in one step UPDATE old flow
  source: pay.js:1
- id: decision:shop.one-step
  title: One step checkout
  affects: [req:shop.checkout]
  status: approved
- id: goal:shop.fast
  title: Fast checkout REWORK
  status: proposed
  parts: [req:shop.checkout]
\`\`\`

req:shop.checkout.sub The card is charged in one step, and that is the sub CONTRA — refines req:shop.checkout

question:shop.q Is it ASK? related to req:shop.checkout

task:shop.t Ship the checkout part of req:shop.checkout #open

Some prose mentions req:shop.checkout without meaning much.
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-impact-'));
fs.writeFileSync(path.join(dir, 'shop.md'), md);
const g = new Graph(parseFiles([path.join(dir, 'shop.md')]));

// ---- structural candidates
const cands = impact.structuralCandidates(g, 'req:shop.checkout');
const byId = Object.fromEntries(cands.map(c => [c.id, c]));
assert.ok(byId['rule:shop.charge'] && byId['rule:shop.charge'].path === 'satisfied-by', 'what satisfies it is reached: ' + JSON.stringify(byId['rule:shop.charge']));
assert.strictEqual(byId['req:shop.checkout.retry'].path, 'refined-by');
assert.strictEqual(byId['decision:shop.one-step'].path, 'affected-by');
assert.strictEqual(byId['task:shop.t'].path, 'contains');
assert.strictEqual(byId['req:shop.checkout.sub'].path, 'refined-by');
assert.strictEqual(byId['question:shop.q'].path, 'related-from');
assert.ok(!byId['module:shop'], 'pages are not candidates');
assert.ok(cands.every(c => c.distance <= 2), 'two hops');
assert.ok(byId['rule:shop.charge'].weight > byId['task:shop.t'].weight, 'decay by verb');
console.log('ok impact: structural candidates with paths —', cands.map(c => `${c.id} (${c.path}, ${c.weight})`).join(', '));

// ---- verbatim repeat: patched without a model call
assert.strictEqual(impact.verbatimUpdate('The card is charged in one step, and more', 'The card is charged in one step', 'The card is charged in two steps'), 'The card is charged in two steps, and more');
assert.strictEqual(impact.verbatimUpdate('unrelated', 'The card is charged in one step', 'x'), null);
console.log('ok impact: verbatim repeat');

// ---- the judged run through the fake judge
process.env.WF_JUDGE_CMD = `node ${path.join(__dirname, 'fake-impact.js')}`;
(async () => {
    const change = { node: 'req:shop.checkout', kind: 'req', before: 'the card is charged in one step', after: 'the card is charged in two steps' };
    const batches = [];
    const cacheFile = path.join(dir, 'impact.json');
    const verdicts = await impact.judgeImpact(change, cands, { cacheFile, onBatch: b => { batches.push(b.length); } });
    const v = Object.fromEntries(cands.map((c, i) => [c.id, verdicts[i]]));
    assert.strictEqual(v['rule:shop.charge'].verdict, 'update');
    assert.ok(v['rule:shop.charge'].update.text.includes('new flow'), 'the update carries the new text');
    assert.strictEqual(v['req:shop.checkout.sub'].verdict, 'contradicts');
    assert.strictEqual(v['question:shop.q'].verdict, 'ask');
    assert.strictEqual(v['req:shop.checkout.retry'].verdict, 'unaffected');
    assert.ok(batches.length >= 1 && batches.reduce((a, b) => a + b, 0) === cands.length, 'every candidate landed in a batch');
    assert.ok(fs.existsSync(cacheFile), 'cached');
    const again = await impact.judgeImpact(change, cands, { cacheFile });
    assert.ok(again.every(x => x.cached), 'the second run is all cache');
    const budgeted = await impact.judgeImpact({ ...change, after: 'three steps' }, cands, { cacheFile, budget: { candidates: 2, calls: 1 } });
    assert.strictEqual(budgeted.filter(Boolean).length, 2, 'the budget caps candidates');
    console.log('ok impact: judged run —', Object.entries(v).map(([k, x]) => `${k}: ${x.verdict}`).join(', '));
    fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
