'use strict';
// The eval suite in CI (module:benchmarks, task:memory.eval-cli): the tier-1 suites replay their recordings on the
// product's own history — no app, no model — and the results file, the gate and the report have the shape
// store:eval-results says. Nothing here calls a model: a suite whose recording is missing fails, as it should.
//   node test/eval.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gate, writeResult, report, scoreLine } = require('../eval/lib/results');
const { Recording, MissingRecording } = require('../eval/lib/record');
const { kappa } = require('../eval/judge/agreement');
const { baseContract } = require('../eval/compare');

// test:eval#gate — the gate (req:memory.eval-gate, decision:memory.eval-tolerance): a drop beyond the tolerance, in points, fails; higher-is-worse scores flip
{
    const prev = { scores: { 'a.recall': { value: 0.60 }, 'b.rank': { value: 2, unit: 'rank', lowerIsBetter: true }, 'c.size': { value: 40, unit: 'count', gated: false } } };
    const now = { 'a.recall': { value: 0.54 }, 'b.rank': { value: 2, unit: 'rank', lowerIsBetter: true }, 'c.size': { value: 90, unit: 'count', gated: false }, 'd.new': { value: 0.1 } };
    const drops = gate(now, prev);
    assert.deepStrictEqual(drops.map(d => d.score), ['a.recall'], 'a 6-point drop fails, a size never does');
    assert.strictEqual(now['a.recall'].delta, -6); assert.strictEqual(now['a.recall'].tolerance, 5); assert.strictEqual(now['d.new'].previous, null);
    assert.deepStrictEqual(gate({ 'a.recall': { value: 0.56 } }, prev), [], 'a 4-point drop passes');
    assert.deepStrictEqual(gate({ 'b.rank': { value: 9, unit: 'rank', lowerIsBetter: true } }, prev).map(d => d.score), ['b.rank'], 'a rank that grows fails');
}
// results files: written per date and suite, the previous one found, --baseline accepts, the report lists latest / previous
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-eval-test-'));
    process.env.WF_EVAL_DIR = path.join(dir, '_build', 'eval');
    const r1 = writeResult(dir, 'own', { scores: { 'x.recall': { value: 0.8 } } }, { when: '2026-01-01' });
    assert.ok(fs.existsSync(r1.file) && !r1.drops.length && !r1.previous);
    const r2 = writeResult(dir, 'own', { scores: { 'x.recall': { value: 0.7 } } }, { when: '2026-01-02' });
    assert.strictEqual(r2.drops.length, 1, 'the second run drops 10 points'); assert.strictEqual(path.basename(r2.previous.file), '2026-01-01-own.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(r2.file, 'utf8')).gate.passed, false);
    const r3 = writeResult(dir, 'own', { scores: { 'x.recall': { value: 0.7 } } }, { when: '2026-01-03', baseline: 'new judge' });
    assert.strictEqual(r3.drops.length, 0); assert.strictEqual(JSON.parse(fs.readFileSync(r3.file, 'utf8')).gate.baseline, 'new judge');
    // cards-written (test:eval#cards-written, task:memory.eval-cards): a product with an Evaluation project gets its runs as cards
    fs.mkdirSync(path.join(dir, 'projects', 'evaluation', 'docs'), { recursive: true });
    const { writeCards } = require('../eval/lib/cards');
    const c = writeCards(dir); const md = fs.readFileSync(c.file, 'utf8');
    assert.strictEqual(c.runs, 3); assert.ok(md.includes('- id: eval-run:2026-01-03-own') && md.includes('- id: eval-score:2026-01-02-own.x-recall') && md.includes('gate: failed') && md.includes('delta: "-10 pts"'), 'run and score cards with gate and delta');
    const rep = report(dir); assert.strictEqual(rep.suites[0].suite, 'own'); assert.strictEqual(rep.suites[0].latest.date, '2026-01-03'); assert.strictEqual(rep.suites[0].previous.date, '2026-01-02');
    assert.ok(scoreLine('x.recall', JSON.parse(fs.readFileSync(r2.file, 'utf8')).scores['x.recall']).includes('Δ -10 pts'));
    delete process.env.WF_EVAL_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
}
// recordings: replay serves only what was recorded; missing throws; live records
{
    const name = `test-${process.pid}`; const rec = new Recording(name, { live: false });
    assert.rejects(() => rec.get({ q: 1 }, () => 'x'), e => e instanceof MissingRecording);
    const live = new Recording(name, { live: true }); let calls = 0;
    (async () => {
        assert.strictEqual(await live.get({ q: 1 }, () => { calls++; return 'x'; }), 'x'); assert.strictEqual(await live.get({ q: 1 }, () => { calls++; return 'y'; }), 'x'); assert.strictEqual(calls, 1);
        const replay = new Recording(name, { live: false }); assert.strictEqual(await replay.get({ q: 1 }, () => 'z'), 'x');
        fs.unlinkSync(live.file);
    })().catch(e => { console.error(e); process.exit(1); });
}
// the requirement-pairs pipeline (eval/public/reqpairs) on the ten-pair fixture: csv → stratified sample → verdicts → macro-F1; a fake judge, no model
{
    const rp = require('../eval/public/reqpairs');
    const rows = rp.readCsv(path.join(__dirname, '..', 'eval', 'public', 'reqpairs', 'fixture.csv'));
    assert.strictEqual(rows.length, 10); assert.deepStrictEqual([...new Set(rows.map(r => rp.norm(r.label)))].sort(), ['conflict', 'duplicate', 'neutral']);
    const s6 = rp.sample(rows, 6); assert.ok(s6.length <= 8 && s6.filter(r => r.label === 'duplicate').length === 2, 'every minority pair is in');
    const perfect = rp.macroF1(rows.map(r => ({ ...r, pred: r.label })), ['conflict', 'duplicate', 'neutral']); assert.strictEqual(perfect.macroF1, 1);
    const allNeutral = rp.macroF1(rows.map(r => ({ ...r, pred: 'neutral' })), ['conflict', 'duplicate', 'neutral']); assert.ok(allNeutral.macroF1 < 0.3);
}
// Cohen's κ: perfect agreement 1, chance 0
assert.strictEqual(kappa([{ label: 'contradicts', verdict: 'contradicts' }, { label: 'consistent', verdict: 'consistent' }]), 1);
assert.strictEqual(kappa([{ label: 'contradicts', verdict: 'consistent' }, { label: 'consistent', verdict: 'contradicts' }]), -1);
assert.strictEqual(kappa([]), null);
// the without arm's contract: the read-Wye-first section, the constitution and the product instructions are cut, the rest stays
{
    const sys = '# Wye contract\n\nintro\n\n## Read from Wye before you act\n\n- packet\n\n## Write knowledge as typed blocks\n\n- blocks\n\n## Constitution\n- constraint:x\n\n## Product instructions\nown\n';
    const base = baseContract(sys);
    assert.ok(base.includes('## Write knowledge') && !base.includes('## Read from Wye') && !base.includes('constraint:x') && !base.includes('own'));
}
// the tier-1 suites replay on the product's own history when a truth and the recordings exist (they are built by
// `wye eval own --live`; CI without them skips the replay rather than judging nothing)
(async () => {
    const own = require('../eval/own');
    const root = path.join(__dirname, '..', 'data', 'products', 'wye');
    const hasTruth = fs.readdirSync(path.join(__dirname, '..', 'eval', 'own')).some(f => f.startsWith('truth-wye-')) || fs.existsSync(path.join(root, 'projects'));
    if (!hasTruth || !fs.existsSync(path.join(__dirname, '..', 'eval', 'recorded', 'semantic-wye.json'))) { console.log('ok — eval lib (no recordings to replay)'); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-eval-replay-'));
    // replay into a scratch results folder so the test never writes the product's real results
    const { loadProduct } = require('../eval/lib/product'); const P = loadProduct('wye');
    process.env.WF_EVAL_DIR = path.join(tmp, 'eval');
    let r;
    try { r = await own.run({ product: 'wye', suite: 'packet,currency,impact,contradictions', live: false, log: () => {} }); } finally { delete process.env.WF_EVAL_DIR; }
    const missing = r.errors.filter(e => /recording missing/.test(e));
    assert.ok(!r.errors.filter(e => !/recording missing/.test(e)).length, 'suites ran: ' + r.errors.join('; '));
    // test:eval#packet-completeness, #currency, #contradictions, #impact-cochange (#consolidation replays only when its recording covers every session)
    const anchors = { 'packet-completeness': ['packet.recall', 'vector.recall@10', 'packet.size-median'], currency: ['currency.mrr', 'currency.superseded-served'], contradictions: ['contradictions.recall', 'contradictions.precision'], 'impact-cochange': ['impact.structural.recall@5', 'impact.semantic.recall@10', 'impact.blended.recall@10'] };
    for (const [anchor, keys] of Object.entries(anchors)) for (const k of keys) assert.ok(k in r.result.scores || missing.length, `${anchor}: score ${k} present`);
    for (const [k, s] of Object.entries(r.result.scores)) assert.ok(s.value === null || (typeof s.value === 'number' && (s.unit || (s.value >= 0 && s.value <= 1))), `${k} is a share or carries a unit`);
    assert.ok(r.result.promptHashes.verdict && r.result.promptHashes.consolidation && r.result.model, 'model and prompt hashes recorded');
    assert.strictEqual(r.result.graphSha, P.graphSha);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`ok — eval lib; replayed ${Object.keys(r.result.scores).length} score(s) on graph ${P.graphSha}${missing.length ? ' (' + missing.length + ' suite(s) need a live run: the graph changed since the recording)' : ''}`);
})().catch(e => { console.error(e); process.exit(1); });
