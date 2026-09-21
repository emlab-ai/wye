'use strict';
// The judge set (module:benchmarks, task:memory.eval-judge-set, question:memory.eval-judge): eval/judge/labels.jsonl
// holds pairs the person labelled — one JSON object per line, { a, b, textA, textB, label } with label one of
// contradicts | duplicate | refines | consistent, or null while unlabelled. `wye eval judge --agreement` runs the
// judge (lib/judge.js, the prompt the Inbox uses) over the labelled pairs, records the verdicts in
// eval/recorded/judge.json and prints Cohen's κ, which every model-scored number shows beside it. `wye eval judge
// --sample 50` writes candidate pairs to label (a model never labels its own test: the label column stays null
// until the person fills it). A judge change (model or prompt hash) makes the κ stale and reruns it.
const fs = require('fs');
const path = require('path');
const judge = require('../../lib/judge');
const { Recording } = require('../lib/record');
const { writeResult, listResults } = require('../lib/results');
const { nodeText } = require('../lib/product');

const LABELS = path.join(__dirname, 'labels.jsonl');
const KINDS = ['contradicts', 'duplicate', 'refines', 'consistent'];

function readLabels(file = LABELS) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`labels.jsonl line ${i + 1} is not JSON`); } });
}
function kappa(pairs) {
    const n = pairs.length; if (!n) return null;
    let agree = 0; const pa = {}, pb = {};
    for (const p of pairs) { if (p.label === p.verdict) agree++; pa[p.label] = (pa[p.label] || 0) + 1; pb[p.verdict] = (pb[p.verdict] || 0) + 1; }
    const po = agree / n; let pe = 0; for (const k of KINDS) pe += ((pa[k] || 0) / n) * ((pb[k] || 0) / n);
    return pe === 1 ? 1 : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
}

// κ over the labelled pairs; verdicts recorded so CI replays them
async function agreement({ live = false, model = judge.DEFAULT_MODEL, log = () => {} } = {}) {
    const all = readLabels(); const labelled = all.filter(p => KINDS.includes(p.label));
    if (!labelled.length) return { kappa: null, n: 0, labelled: 0, unlabelled: all.length, model, prompt: judge.promptHash(), rows: [] };
    const rec = new Recording('judge', { live });
    const rows = [];
    for (const p of labelled) {
        const pair = { a: { id: p.a, text: p.textA, status: p.statusA || '', date: p.dateA || '' }, b: { id: p.b, text: p.textB, status: p.statusB || '', date: p.dateB || '' } };
        const v = await rec.get({ a: pair.a, b: pair.b, model, prompt: judge.promptHash() }, async () => { log(`judge: ${p.a} ↔ ${p.b}`); const [r] = await judge.judgePairs([pair], { model, budget: { pairs: 1, calls: 1 } }); if (!r) throw new Error('the judge gave no verdict'); return { kind: r.kind, conflict: r.conflict, reason: r.reason }; }, { what: `${p.a} ↔ ${p.b}`, meta: { model, prompt: judge.promptHash() } });
        rows.push({ a: p.a, b: p.b, label: p.label, verdict: v.kind, conflict: v.conflict, reason: v.reason });
    }
    rec.save();
    const confusion = {}; for (const r of rows) { confusion[r.label] = confusion[r.label] || {}; confusion[r.label][r.verdict] = (confusion[r.label][r.verdict] || 0) + 1; }
    return { kappa: kappa(rows), n: rows.length, labelled: labelled.length, unlabelled: all.length - labelled.length, agree: rows.filter(r => r.label === r.verdict).length, model, prompt: judge.promptHash(), confusion, rows };
}

// the judge as the results files name it: model, prompt hash and the latest κ for that judge (stale when the judge changed)
function judgeMeta(productDir) {
    const latest = listResults(productDir, 'judge')[0];
    const cur = { model: judge.DEFAULT_MODEL, prompt: judge.promptHash() };
    if (!latest) return { ...cur, kappa: null, n: 0, note: 'no agreement run yet — wye eval judge --agreement' };
    const d = latest.data; const same = d.model === cur.model && d.promptHashes && d.promptHashes.verdict === cur.prompt;
    return { ...cur, kappa: same ? d.scores['judge.kappa'].value : null, n: same ? d.scores['judge.kappa'].n : 0, date: latest.date, ...(same ? {} : { note: `κ ${d.scores['judge.kappa'].value} was measured for ${d.model} @ ${d.promptHashes && d.promptHashes.verdict} — rerun wye eval judge --agreement for this judge` }) };
}

// candidate pairs for the person to label: drift positives (both sides in the graph), then same-kind neighbour pairs
function sample(P, { n = 50 } = {}) {
    const g = P.graph; const out = []; const seen = new Set(readLabels().map(p => p.a + '|' + p.b));
    const asJ = x => ({ id: x.id, text: nodeText(x), status: x.status, date: (x.body || '').match(/^date:\s*(\S+)/m)?.[1] || '' });
    for (const d of g.data.nodes.filter(x => x.kind === 'drift' && x.defined)) { const sides = (g.out.get(d.id) || []).filter(e => e.verb === 'contradicts').map(e => g.node(e.to)).filter(x => x && x.defined && x.body); if (sides.length >= 2) out.push({ a: asJ(sides[0]), b: asJ(sides[1]), from: d.id }); }
    let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (const p of g.deepPairs({ limit: 3000 }).sort(() => rnd() - 0.5)) out.push({ a: p.a, b: p.b, from: 'neighbour' });
    return out.filter(p => !seen.has(p.a.id + '|' + p.b.id)).slice(0, n).map(p => ({ a: p.a.id, b: p.b.id, textA: p.a.text, textB: p.b.text, statusA: p.a.status, statusB: p.b.status, dateA: p.a.date, dateB: p.b.date, from: p.from, label: null }));
}

async function run(opts) {
    const log = opts.log || (m => console.error('eval: ' + m));
    const live = !!opts.live || process.env.WATERFALL_LIVE === '1';
    if (opts.sample) {
        const { loadProduct } = require('../lib/product'); const P = loadProduct(opts.product);
        const rows = sample(P, { n: Number(opts.sample) || 50 });
        fs.appendFileSync(LABELS, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
        return { sampled: rows.length, file: LABELS, total: readLabels().length };
    }
    const a = await agreement({ live, log });
    const { loadProduct } = require('../lib/product'); const P = loadProduct(opts.product);
    if (!a.n) return { agreement: a, file: null };
    const { file } = writeResult(P.productDir, 'judge', { graphSha: P.graphSha, gitSha: P.gitSha, live, model: a.model, promptHashes: { verdict: a.prompt }, judge: { model: a.model, prompt: a.prompt }, scores: { 'judge.kappa': { value: a.kappa, n: a.n, unit: 'points', note: `Cohen's κ, judge vs the person, over ${a.n} labelled pairs (${a.unlabelled} unlabelled); agreement ${a.agree}/${a.n}` } }, runs: a.rows, meta: { confusion: a.confusion, labels: path.relative(process.cwd(), LABELS) } }, { baseline: opts.baseline || null });
    return { agreement: a, file };
}
function print(r) {
    if (r.sampled !== undefined) { console.log(`${r.sampled} pair(s) appended to ${r.file} (${r.total} lines) — fill "label" with contradicts | duplicate | refines | consistent, then wye eval judge --agreement`); return; }
    const a = r.agreement;
    if (!a.n) { console.log(`no labelled pairs in eval/judge/labels.jsonl (${a.unlabelled} unlabelled) — wye eval judge --sample 50, label them, then --agreement`); return; }
    console.log(`judge ${a.model} @ ${a.prompt}: κ ${a.kappa} over ${a.n} labelled pairs (agreement ${a.agree}/${a.n}; ${a.unlabelled} still unlabelled)`);
    for (const [l, row] of Object.entries(a.confusion)) console.log(`  person ${l.padEnd(11)} → judge ${Object.entries(row).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (r.file) console.log(`written ${r.file}`);
}

module.exports = { run, print, agreement, kappa, judgeMeta, readLabels, sample, LABELS };
