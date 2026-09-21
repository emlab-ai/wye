'use strict';
// store:eval-results (module:benchmarks): one run of one suite as data/products/<product>/_build/eval/<date>-<suite>.json —
// `{ suite, date, graphSha, gitSha, model, promptHashes, judge, scores: { <benchmark>: { value, n, ci?, baseline?,
// previous?, delta?, tolerance? } }, runs: [...] }`. Derived, never edited; the Evaluation page and `wye eval report`
// read the folder. The gate (req:memory.eval-gate, decision:memory.eval-tolerance): every score carries its own
// tolerance (5 points by default); a run whose score drops below the previous file's by more than it exits non-zero
// after every suite has run, unless there is no previous file or `--baseline` accepted the new scores.
const fs = require('fs');
const path = require('path');

const TOLERANCE = 5;   // percentage points, per suite (decision:memory.eval-tolerance)

// the results folder; WF_EVAL_DIR overrides it (the tests write to a scratch folder)
const evalDir = productDir => process.env.WF_EVAL_DIR || path.join(productDir, '_build', 'eval');
const today = () => new Date().toISOString().slice(0, 10);

// every results file of a suite, newest first: [{ file, date, data }]
function listResults(productDir, suite) {
    const dir = evalDir(productDir);
    if (!fs.existsSync(dir)) return [];
    const re = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})(?:T[\\d-]+)?-${suite}\\.json$`);
    return fs.readdirSync(dir).map(f => ({ f, m: f.match(re) })).filter(x => x.m).map(x => { try { return { file: path.join(dir, x.f), date: x.m[1], data: JSON.parse(fs.readFileSync(path.join(dir, x.f), 'utf8')) }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.file.localeCompare(a.file));
}
// the latest previous run of a suite, before `notFile` (the one being written)
function previousResult(productDir, suite, notFile) { return listResults(productDir, suite).find(r => r.file !== notFile) || null; }

// Compare the new scores against the previous file: fills previous / delta / tolerance on every score, returns the
// drops beyond tolerance. A score is a number in [0, 1] (a share) or a percentage; deltas are in points.
function gate(scores, previous, { tolerance = TOLERANCE } = {}) {
    const drops = [];
    for (const [name, s] of Object.entries(scores)) {
        if (!s || typeof s.value !== 'number') continue;
        if (s.gated === false) { const prev0 = previous && previous.scores && previous.scores[name]; s.previous = prev0 && typeof prev0.value === 'number' ? prev0.value : null; continue; }   // reported, never gated (a size, a count)
        s.tolerance = s.tolerance ?? tolerance;
        const prev = previous && previous.scores && previous.scores[name];
        if (!prev || typeof prev.value !== 'number') { s.previous = null; s.delta = null; continue; }
        s.previous = prev.value;
        const pts = x => (s.unit === 'points' || s.unit === 'count' || s.unit === 'rank') ? x : x * 100;
        s.delta = Math.round((pts(s.value) - pts(prev.value)) * 10) / 10;
        // higher is better unless the score says otherwise (a rank, a count of superseded nodes served)
        const drop = s.lowerIsBetter ? -s.delta : s.delta;
        if (drop < -s.tolerance) drops.push({ score: name, value: s.value, previous: prev.value, delta: s.delta, tolerance: s.tolerance });
    }
    return drops;
}

// Write one run; `baseline` (a reason string) records that the new scores are accepted as the baseline. Returns
// { file, drops } — drops empty when the gate passed.
function writeResult(productDir, suite, result, { baseline = null, tolerance = TOLERANCE, when = null } = {}) {
    const dir = evalDir(productDir); fs.mkdirSync(dir, { recursive: true });
    const date = when || today();
    const file = path.join(dir, `${date}-${suite}.json`);
    const previous = previousResult(productDir, suite, file);
    const drops = gate(result.scores || {}, previous && previous.data, { tolerance });
    const out = { suite, date, ...result, previousFile: previous ? path.basename(previous.file) : null, gate: baseline ? { passed: true, baseline: String(baseline), drops } : { passed: !drops.length, drops } };
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    // the run as cards of the Evaluation project (task:memory.eval-cards): the product's documents say what was measured
    try { require('./cards').writeCards(productDir); } catch (e) { console.error('eval: cards not written: ' + e.message); }
    return { file, drops: baseline ? [] : drops, previous };
}

const fmt = (s, v) => v === null || v === undefined ? 'n/a' : (s.unit === 'points' || s.unit === 'count' || s.unit === 'rank') ? String(Math.round(v * 100) / 100) : Math.round(v * 1000) / 10 + '%';
// One score line as the CLI prints it: name, value, previous, delta, tolerance
function scoreLine(name, s) {
    const d = s.delta === null || s.delta === undefined ? '' : `  Δ ${s.delta > 0 ? '+' : ''}${s.delta} pts`;
    const p = s.previous === null || s.previous === undefined ? '  (no previous)' : `  (was ${fmt(s, s.previous)})`;
    return `  ${name.padEnd(28)} ${fmt(s, s.value).padStart(7)}${s.n !== undefined ? ` n=${s.n}` : ''}${p}${d}${s.tolerance !== undefined ? `  tol ${s.tolerance}` : ''}${s.judge ? `  κ ${s.judge.kappa === null || s.judge.kappa === undefined ? 'n/a' : s.judge.kappa}` : ''}`;
}

// `wye eval report`: the latest run of every suite (or the ones asked) with the previous and the delta
function report(productDir, { suites = null, since = null } = {}) {
    const dir = evalDir(productDir);
    if (!fs.existsSync(dir)) return { suites: [] };
    const names = [...new Set(fs.readdirSync(dir).map(f => (f.match(/^\d{4}-\d{2}-\d{2}(?:T[\d-]+)?-(.+)\.json$/) || [])[1]).filter(Boolean))].filter(s => !suites || suites.includes(s));
    return { suites: names.map(suite => { const all = listResults(productDir, suite).filter(r => !since || r.date >= since); return { suite, latest: all[0] || null, previous: all[1] || null, history: all.map(r => ({ date: r.date, file: path.basename(r.file), scores: Object.fromEntries(Object.entries(r.data.scores || {}).map(([k, s]) => [k, s.value])) })) }; }) };
}

module.exports = { TOLERANCE, evalDir, listResults, previousResult, gate, writeResult, scoreLine, report, fmt, today };
