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

// --- the constraint packet: structural, complete, current by construction (decision:memory.constraint-packet)
const c = g.constraints(['entity:shop.price']);
const ids = Object.values(c.byKind).flat().map(n => n.id);
assert.ok(ids.includes('rule:shop.no-negative') && ids.includes('constraint:shop.local-first') && ids.includes('decision:shop.gross-pricing') && ids.includes('goal:shop.launch'), 'rule, constraint, decision, goal within two hops: ' + ids);
assert.ok(!ids.includes('decision:shop.old-pricing') && !ids.includes('constraint:shop.old'), 'superseded and retired left out');
assert.ok(c.hidden >= 3, 'ended nodes reached through the document are counted: ' + c.hidden);
assert.deepStrictEqual(c.questions.map(q => q.id), ['question:shop.rounding'], 'open question on the seed, not the resolved one');
const pk = g.renderConstraints(c);
assert.ok(pk.includes('- rule:shop.no-negative — A price is never negative (source: lib/price.js:12)'), pk);
assert.ok(pk.indexOf('### Constraints') < pk.indexOf('### Rules') && pk.indexOf('### Rules') < pk.indexOf('### Decisions'));
assert.ok(g.constraints(['entity:shop.price'], { all: true }).byKind.decision.some(n => n.id === 'decision:shop.old-pricing'), '--all brings the old decision back');

// --- shapes (decision:memory.shapes): declared on the type card, enforced by check in the type's words
const shaped = `---
node: module:shapes
title: Shapes
---

# Shapes

\`\`\`yaml
- id: type:policy
  extends: type:node
  props:
    statement: text?
    source: string?
    owner: string?
    approved-by: ref node?
  shapes:
    * requires statement as error
    approved requires source | owner
    approved-by refs status approved
    nonsense line here
- id: policy:ok
  statement: fine
  status: approved
  owner: alex
- id: policy:no-statement
  status: draft
- id: policy:approved-bare
  statement: has no source nor owner
  status: approved
  approved-by: policy:draft-one
- id: policy:draft-one
  statement: a draft
  status: draft
- id: decision:shapes.gone
  title: superseded without a successor
  status: superseded
- id: rule:shapes.no-source
  statement: a rule without a source
\`\`\`

policy:prose-bare Prose instance without a statement key #approved
`;
fs.writeFileSync(path.join(dir, 'shapes.md'), shaped);
const g2 = new Graph(parseFiles([path.join(dir, 'shapes.md')]));
const t = g2.types.get('type:policy');
assert.strictEqual(t.shapes.filter(sh => sh.from === 'type:policy').length, 3, 'three shapes read on the type');
assert.ok(t.shapes.some(sh => sh.from === 'type:node'), 'shapes inherit along extends');
const r = g2.check({ repo: dir });
const all = r.errors.concat(r.warnings).join('\n');
assert.ok(r.errors.some(e => /policy:no-statement: policy has no statement/.test(e)), 'as error → error: ' + all);
assert.ok(r.warnings.some(w => /policy:approved-bare: approved policy has no source or owner/.test(w)), 'alternatives: ' + all);
assert.ok(r.warnings.some(w => /policy:approved-bare: approved-by → policy:draft-one is draft, not approved/.test(w)), 'refs status: ' + all);
assert.ok(!/policy:ok/.test(all), 'a conforming instance passes');
assert.ok(r.warnings.some(w => /policy:prose-bare: policy has no statement/.test(w)) && !r.errors.some(e => /policy:prose-bare/.test(e)), 'a prose node only warns');
assert.ok(r.warnings.some(w => /decision:shapes.gone: superseded decision has no superseded-by or until/.test(w)), 'base shape on type:node: ' + all);
assert.ok(r.errors.some(e => /rule:shapes.no-source: rule has no source/.test(e)), 'the rule check now comes from the base ontology');
assert.ok(r.warnings.some(w => /shape not understood/.test(w)));
assert.ok(g2.check({ repo: dir, strict: true }).errors.some(e => /approved-bare: approved policy/.test(e)), '--strict makes shapes errors');

// --- forgetting (decision:memory.forgetting): a plan that is done is archived for retrieval; its knowledge is not
const donePlan = `---
node: plan:plan-old
type: plan
title: an old request
status: done
session: abc
---

# an old request

## Tasks

- [x] task:old.one Rename the pricing field part of plan:plan-old
- [x] task:old.two Ship the pricing page part of plan:plan-old

## Plan

\`\`\`yaml
- id: decision:old.pricing-field
  title: The pricing field is called amount
  status: approved
\`\`\`
`;
const livePlan = donePlan.replace('plan:plan-old', 'plan:plan-live').replace('status: done', 'status: running').replace(/plan:plan-old/g, 'plan:plan-live').replace(/task:old/g, 'task:live').replace('- [x] task:live.two', '- [ ] task:live.two').replace('decision:old.pricing-field', 'decision:live.pricing-field');
fs.writeFileSync(path.join(dir, 'plan-old.md'), donePlan); fs.writeFileSync(path.join(dir, 'plan-live.md'), livePlan);
const g3 = new Graph(parseFiles([path.join(dir, 'plan-old.md'), path.join(dir, 'plan-live.md')]));
assert.ok(g3.node('plan:plan-old').archived && g3.node('task:old.one').archived, 'a done plan and its tasks are archived');
assert.ok(!g3.node('decision:old.pricing-field').archived, 'the knowledge in it is not');
assert.ok(!g3.node('plan:plan-live').archived && !g3.node('task:live.two').archived, 'a live plan is not');
assert.ok(!g3.search('pricing').some(h => h.n.id === 'task:old.one') && g3.search('pricing').some(h => h.n.id === 'task:live.two'), 'archived tasks leave search');
assert.ok(g3.search('pricing').some(h => h.n.id === 'decision:old.pricing-field'), 'the decision stays');
assert.ok(g3.search('pricing', { all: true }).some(h => h.n.id === 'task:old.one'), '--all shows archived');

// --- the verdict pass (decision:memory.write-time-verdict): pairs against neighbours, judged, cached, lines for the document
(async () => {
    const { judgePairs, verdictLines, promptHash } = require('../lib/judge');
    process.env.WF_JUDGE_CMD = 'node ' + path.join(__dirname, 'fake-judge.js');
    const judged = `---
node: module:pay
title: Pay
---

# Pay

\`\`\`yaml
- id: entity:pay.price
  description: a price
- id: decision:pay.net
  title: Prices are stored net CONTRA
  status: approved
  date: 2026-01-01
  affects: [entity:pay.price]
- id: decision:pay.gross
  title: Prices are stored gross CONTRA LATER
  status: proposed
  date: 2026-05-01
  affects: [entity:pay.price]
- id: decision:pay.gross-copy
  title: Prices are stored gross SAME
  status: proposed
  affects: [entity:pay.price]
- id: rule:pay.rounding
  statement: Half-up rounding NARROW
  source: lib/pay.js:3
  governs: [entity:pay.price]
- id: constraint:pay.local
  statement: Every write lands locally first
  status: approved
- id: decision:pay.far
  title: Unrelated, three hops away
  status: approved
\`\`\`
`;
    fs.writeFileSync(path.join(dir, 'pay.md'), judged);
    const g4 = new Graph(parseFiles([path.join(dir, 'pay.md')]));
    const pairs = g4.verdictPairs(['decision:pay.gross']);
    const as = pairs.map(p => p.a.id);
    assert.ok(as.includes('decision:pay.net') && as.includes('rule:pay.rounding') && as.includes('decision:pay.gross-copy'), 'same-kind neighbours within two hops: ' + as);
    assert.ok(as.includes('constraint:pay.local'), 'every approved constraint is a pair');
    assert.ok(!as.includes('decision:pay.far') && !as.includes('entity:pay.price'), 'not entities, not far nodes');
    assert.ok(pairs.every(p => p.b.id === 'decision:pay.gross'), 'B is the judged node');
    const cacheFile = path.join(dir, '_build', 'verdicts.json');
    const vs = await judgePairs(pairs, { cacheFile, model: 'fake' });
    const by = Object.fromEntries(vs.map(v => [v.a, v]));
    assert.strictEqual(by['decision:pay.net'].kind, 'contradicts'); assert.strictEqual(by['decision:pay.net'].conflict, 'dynamic');
    assert.strictEqual(by['decision:pay.gross-copy'].kind, 'consistent', 'SAME only on one side → consistent');
    assert.strictEqual(by['constraint:pay.local'].kind, 'consistent');
    assert.ok(vs.every(v => v.model === 'fake' && v.prompt === promptHash() && v.cached === false), 'model and prompt hash recorded');
    const again = await judgePairs(pairs, { cacheFile, model: 'fake' });
    assert.ok(again.every(v => v.cached), 'the same pair is never asked twice');
    const budgeted = await judgePairs(g4.verdictPairs(['decision:pay.gross-copy']), { cacheFile, model: 'fake', budget: { pairs: 1, calls: 1 } });
    assert.strictEqual(budgeted.filter(Boolean).length, 1, 'budget: one new pair judged, the rest null');
    const lines = verdictLines(by['decision:pay.net'], { product: 'pay' });
    assert.strictEqual(lines.length, 2, 'a contradicts verdict writes the verdict and an open contradiction');
    assert.ok(/^verdict:[0-9a-f]{12} contradicts decision:pay.net — .* \(kind: contradicts, conflict: dynamic, model: fake, prompt: [0-9a-f]{8}, pair: decision:pay.net decision:pay.gross\)$/.test(lines[0]), lines[0]);
    assert.ok(/^contradiction:pay\.[0-9a-f]{12} decision:pay.gross contradicts decision:pay.net — .* #open \(between: decision:pay.gross decision:pay.net, conflict: dynamic/.test(lines[1]), lines[1]);
    assert.deepStrictEqual(verdictLines(by['constraint:pay.local']), [], 'consistent writes nothing');
    // the lines parse back as nodes with the right kinds, status and edges
    fs.writeFileSync(path.join(dir, 'pay.md'), judged.replace('  date: 2026-05-01\n  affects: [entity:pay.price]\n- id: decision:pay.gross-copy', '  date: 2026-05-01\n  affects: [entity:pay.price]\n- id: decision:pay.gross-copy') + '\n' + lines.map(l => l).join('\n\n') + '\n');
    const g5 = new Graph(parseFiles([path.join(dir, 'pay.md')]));
    const contra = g5.data.nodes.find(n => n.kind === 'contradiction');
    assert.ok(contra && contra.status === 'open', 'contradiction node open');
    assert.ok(g5.data.edges.some(e => e.from === contra.id && e.verb === 'between' && e.to === 'decision:pay.net'), 'between edges');
    assert.ok(g5.data.nodes.some(n => n.kind === 'verdict' && n.defined));
    // deep pairs: same-kind pairs sharing a neighbour
    const deep = g4.deepPairs();
    assert.ok(deep.some(p => [p.a.id, p.b.id].sort().join() === 'decision:pay.gross,decision:pay.net'), 'net and gross share entity:pay.price');
    assert.ok(!deep.some(p => p.a.kind !== p.b.kind), 'same kind only');
    console.log('memory: ok');
})().catch(e => { console.error(e); process.exit(1); });
