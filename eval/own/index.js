'use strict';
// `wye eval own [--product p] [--suite packet|currency|contradictions|impact|consolidation|all] [--live] [--build-truth]
//               [--baseline "<reason>"] [--tolerance n] [--json]`
// Runs the tier-1 suites on the product's own history and writes _build/eval/<date>-own.json (store:eval-results)
// with the model, the prompt hashes, the judge, the graph sha and the gate (req:memory.eval-gate): a suite whose
// score drops more than its tolerance against the previous file makes the run exit non-zero after every suite ran.
const { loadProduct } = require('../lib/product');
const { semanticRecorder, online } = require('../lib/app');
const fs = require('fs');
const path = require('path');
const { writeResult, scoreLine, TOLERANCE, evalDir, today } = require('../lib/results');
const { loadTruth, truthSummary } = require('./truth');
const suites = require('./suites');
const judge = require('../../lib/judge');
const impactLib = require('../../lib/impact');
const consolidate = require('../../lib/consolidate');
const { judgeMeta } = require('../judge/agreement');

async function run(opts) {
    const log = opts.log || (m => console.error('eval: ' + m));
    const live = !!opts.live || process.env.WATERFALL_LIVE === '1';
    const P = loadProduct(opts.product);
    const truth = loadTruth(P, { log, rebuild: !!opts.buildTruth });
    log(`truth for graph ${P.graphSha}: ${truthSummary(truth)}`);
    if (opts.buildTruth && !opts.suite) return { truth };
    const want = !opts.suite || opts.suite === 'all' ? suites.SUITES : String(opts.suite).split(',');
    const semantic = semanticRecorder(P.product, { live });
    if (live && want.some(s => ['packet', 'currency', 'impact'].includes(s)) && !(await online())) throw new Error('the app is not running (WF_URL) — the semantic hits come from it; start it or replay the recording without --live');
    const scores = {}, runs = {}, meta = {}, errors = [];
    for (const name of want) {
        if (!suites[name]) { errors.push(`unknown suite ${name}`); continue; }
        log(`suite ${name}…`);
        try {
            const r = await suites[name](P, truth, { semantic, live, log });
            Object.assign(scores, r.scores); runs[name] = r.runs; meta[name] = r.meta;
        } catch (e) { errors.push(`${name}: ${e.message}`); log(`${name} failed: ${e.message}`); }
    }
    semantic.rec.save();
    // a partial run (--suite) lands in today's file next to the suites already run today; the other suites' scores stay
    const jm = judgeMeta(P.productDir);
    for (const s of Object.values(scores)) if (s.judge === true) s.judge = { model: jm.model, prompt: jm.prompt, kappa: jm.kappa, n: jm.n };
    const todayFile = path.join(evalDir(P.productDir), `${today()}-own.json`);
    if (want.length < suites.SUITES.length && fs.existsSync(todayFile)) {
        try { const prev = JSON.parse(fs.readFileSync(todayFile, 'utf8')); for (const name of suites.SUITES) if (!want.includes(name) && prev.runs && prev.runs[name]) { runs[name] = prev.runs[name]; meta[name] = prev.meta[name]; for (const [k, v] of Object.entries(prev.scores || {})) if (k.startsWith(name + '.') || (name === 'packet' && k.startsWith('vector.'))) scores[k] = { value: v.value, n: v.n, ...(v.unit ? { unit: v.unit } : {}), ...(v.lowerIsBetter ? { lowerIsBetter: true } : {}), ...(v.gated === false ? { gated: false } : {}), ...(v.note ? { note: v.note } : {}), ...(v.judge ? { judge: v.judge } : {}) }; } } catch { /* start clean */ }
    }
    const result = {
        graphSha: P.graphSha, gitSha: P.gitSha, live, model: judge.DEFAULT_MODEL,
        promptHashes: { verdict: judge.promptHash(), impact: impactLib.promptHash(), consolidation: consolidate.promptHash() },
        judge: jm, truth: { file: path.basename(require('./truth').truthFile(P)), ...Object.fromEntries(['requirements', 'supersessions', 'commits', 'sessions', 'consolidation'].map(k => [k, truth[k].length])) },
        scores, runs, meta, errors,
    };
    const { file, drops, previous } = writeResult(P.productDir, 'own', result, { baseline: opts.baseline || null, tolerance: opts.tolerance || TOLERANCE });
    return { file, drops, previous, result, errors };
}

function print(r, { json = false } = {}) {
    if (json) { console.log(JSON.stringify({ file: r.file, gate: r.result && { drops: r.drops }, scores: r.result.scores, errors: r.errors }, null, 2)); return; }
    const res = r.result;
    console.log(`wye eval own — ${res.live ? 'live' : 'replayed'}; graph ${res.graphSha} (git ${res.gitSha}); model ${res.model}; judge κ ${res.judge && res.judge.kappa !== null && res.judge.kappa !== undefined ? res.judge.kappa : 'n/a'}${r.previous ? `; previous ${path.basename(r.previous.file)}` : '; no previous run'}`);
    for (const [name, s] of Object.entries(res.scores)) console.log(scoreLine(name, s) + (s.note ? `\n${' '.repeat(38)}${s.note}` : ''));
    for (const e of res.errors) console.log(`  ! ${e}`);
    console.log(`written ${r.file}`);
    if (r.drops.length) console.log(`GATE FAILED: ${r.drops.map(d => `${d.score} ${d.previous} → ${d.value} (Δ ${d.delta} pts, tolerance ${d.tolerance})`).join('; ')}`);
    else if (r.previous) console.log('gate passed');
}

module.exports = { run, print };
