'use strict';
// Requirement pairs — the verdict judge alone (module:benchmarks, task:memory.eval-reqpairs-loader).
//   wye eval public reqpairs --fetch                                   says where the CSVs come from; checks data/<set>.csv
//   wye eval public reqpairs --run --set worldvista|uav|pure|opencoss [--sample 500] [--live]
//   wye eval public reqpairs --report
// The sets (WorldVista 10 878 pairs, UAV 6 670, PURE, OpenCOSS 6 786 with 10 conflicts) are labelled conflict / neutral
// (duplicate where PassionNet added it) — Malik et al., arxiv.org/abs/2301.03709, the loaders in their repository;
// PassionNet arxiv.org/abs/2412.01657. They are not at a public URL this loader can fetch: put each set at
// eval/public/reqpairs/data/<set>.csv with the columns req_a, req_b, label (never committed). The pair judge of
// decision:memory.write-time-verdict (lib/judge.js — same prompt, same model as the Inbox) classifies each pair;
// conflict ↔ contradicts, neutral ↔ consistent | refines, duplicate ↔ duplicate. Score: macro-F1 per set and the
// confusion matrix. --sample stratifies by label so every conflict is in. Published (fine-tuned transformers,
// macro-F1): WorldVista 0.908, PURE 0.948, UAV 0.877.
const fs = require('fs');
const path = require('path');
const { loadProduct } = require('../../lib/product');
const { writeResult, listResults } = require('../../lib/results');
const judge = require('../../../lib/judge');

const DATA = path.join(__dirname, 'data');
const SETS = ['worldvista', 'uav', 'pure', 'opencoss'];
const PUBLISHED = { worldvista: 0.908, pure: 0.948, uav: 0.877, opencoss: null };
const SOURCE = 'Malik et al., arxiv.org/abs/2301.03709 (loaders in the paper\'s repository); PassionNet arxiv.org/abs/2412.01657';

// a CSV with a header: req_a, req_b, label (quoted fields, commas and newlines inside quotes allowed)
function readCsv(file) {
    const text = fs.readFileSync(file, 'utf8'); const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
        else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map(h => h.trim().toLowerCase());
    const col = n => head.findIndex(h => h === n || h.replace(/[^a-z]/g, '') === n.replace(/[^a-z]/g, ''));
    const ia = col('req_a') >= 0 ? col('req_a') : col('requirement1'), ib = col('req_b') >= 0 ? col('req_b') : col('requirement2'), il = col('label');
    if (ia < 0 || ib < 0 || il < 0) throw new Error(`${path.basename(file)}: columns req_a, req_b, label expected (got ${head.join(', ')})`);
    return rows.filter(r => r.length > il).map(r => ({ a: r[ia].trim(), b: r[ib].trim(), label: r[il].trim().toLowerCase() })).filter(r => r.a && r.b && r.label);
}
const norm = l => /conflict/.test(l) ? 'conflict' : /dup/.test(l) ? 'duplicate' : 'neutral';
const toLabel = v => v.kind === 'contradicts' ? 'conflict' : v.kind === 'duplicate' ? 'duplicate' : 'neutral';

// stratified by label: every minority-class pair, the rest filled from the majority class, deterministic
function sample(rows, n) {
    if (!n || rows.length <= n) return rows;
    const by = {}; for (const r of rows) (by[r.label] = by[r.label] || []).push(r);
    const classes = Object.keys(by).sort((a, b) => by[a].length - by[b].length);
    let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const out = []; let left = n;
    classes.forEach((c, i) => { const share = i === classes.length - 1 ? Math.max(0, left) : Math.min(by[c].length, Math.max(Math.round(n * by[c].length / rows.length), by[c].length <= 50 ? by[c].length : 1)); const pick = [...by[c]].sort(() => rnd() - 0.5).slice(0, share); out.push(...pick); left -= pick.length; });
    return out;
}
function macroF1(rows, classes) {
    const per = {}; for (const c of classes) { const tp = rows.filter(r => r.label === c && r.pred === c).length, fp = rows.filter(r => r.label !== c && r.pred === c).length, fn = rows.filter(r => r.label === c && r.pred !== c).length; const p = tp + fp ? tp / (tp + fp) : 0, rc = tp + fn ? tp / (tp + fn) : 0; per[c] = { precision: p, recall: rc, f1: p + rc ? 2 * p * rc / (p + rc) : 0, support: tp + fn }; }
    const present = classes.filter(c => per[c].support > 0);
    return { per, macroF1: present.length ? present.reduce((a, c) => a + per[c].f1, 0) / present.length : null };
}

async function runSet(name, { live, model, sampleN, log, file }) {
    const rows = sample(readCsv(file).map(r => ({ ...r, label: norm(r.label) })), sampleN);
    log(`${name}: ${rows.length} pair(s) (${Object.entries(rows.reduce((a, r) => (a[r.label] = (a[r.label] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    if (!live) process.env.WF_JUDGE_CMD = process.env.WF_JUDGE_CMD || 'node -e "process.stdout.write(\'[]\')"';   // replay: the cache is the only judge
    const pairs = rows.map((r, i) => ({ a: { id: `${name}:a${i}`, text: r.a, status: '', date: '' }, b: { id: `${name}:b${i}`, text: r.b, status: '', date: '' } }));
    const verdicts = await judge.judgePairs(pairs, { model, cacheFile: path.join(__dirname, '..', '..', 'recorded', `public-reqpairs-${name}.json`), budget: { pairs: 5000, calls: 600 }, log });
    const judged = rows.map((r, i) => ({ ...r, verdict: verdicts[i] ? verdicts[i].kind : null, pred: verdicts[i] ? toLabel(verdicts[i]) : null })).filter(r => r.pred);
    const classes = [...new Set(judged.map(r => r.label))].sort();
    const confusion = {}; for (const r of judged) { confusion[r.label] = confusion[r.label] || {}; confusion[r.label][r.pred] = (confusion[r.label][r.pred] || 0) + 1; }
    return { set: name, n: judged.length, unjudged: rows.length - judged.length, ...macroF1(judged, classes), confusion, rows: judged.slice(0, 2000).map(r => ({ label: r.label, pred: r.pred, a: r.a.slice(0, 200), b: r.b.slice(0, 200) })) };
}

async function run(opts) {
    const log = opts.log || (m => console.error('reqpairs: ' + m));
    const model = opts.model || judge.DEFAULT_MODEL;
    if (opts.fetch) { fs.mkdirSync(DATA, { recursive: true }); const have = SETS.filter(s => fs.existsSync(path.join(DATA, s + '.csv'))); return { fetched: { source: SOURCE, dir: DATA, have, missing: SETS.filter(s => !have.includes(s)) } }; }
    if (opts.runIt) {
        const live = !!opts.live || process.env.WATERFALL_LIVE === '1';
        const names = opts.set ? String(opts.set).split(',') : SETS.filter(s => fs.existsSync(path.join(DATA, s + '.csv')));
        if (!names.length) throw new Error(`no CSV under ${DATA} — see --fetch`);
        const results = [];
        for (const name of names) { const file = path.join(DATA, name + '.csv'); if (!fs.existsSync(file)) { log(`${name}: no ${file}`); continue; } results.push(await runSet(name, { live, model, sampleN: opts.sample, log, file })); }
        const report = { title: 'Requirement pairs — the verdict judge', source: SOURCE, published: 'macro-F1, fine-tuned transformers: WorldVista 0.908, PURE 0.948, UAV 0.877', judge: `${model} @ ${judge.promptHash()} (the Inbox\'s judge prompt)`, rows: results.map(r => ({ name: r.set, ours: r.macroF1 === null ? null : Math.round(r.macroF1 * 1000) / 1000, n: r.n, theirs: { published: PUBLISHED[r.set] ?? '—' }, note: `${Object.entries(r.per).map(([c, p]) => `${c} F1 ${p.f1.toFixed(2)} (n ${p.support})`).join(', ')}${r.unjudged ? `; ${r.unjudged} unjudged` : ''}` })), notes: ['conflict ↔ contradicts, duplicate ↔ duplicate, neutral ↔ consistent or refines', '--sample stratifies by label so every conflict is in'] };
        const P = loadProduct('wye');
        const scores = Object.fromEntries(results.filter(r => r.macroF1 !== null).map(r => [`reqpairs.${r.set}.macro-f1`, { value: r.macroF1, n: r.n, judge: true }]));
        const { file } = writeResult(P.productDir, 'public-reqpairs', { graphSha: null, gitSha: P.gitSha, live, model, promptHashes: { verdict: judge.promptHash() }, judge: { model, prompt: judge.promptHash() }, scores, runs: results.map(r => ({ set: r.set, n: r.n, confusion: r.confusion, per: r.per, rows: r.rows })), report }, { baseline: 'public benchmarks are not gated' });
        return { report, results, file };
    }
    if (opts.reportIt) { const P = loadProduct('wye'); const r = listResults(P.productDir, 'public-reqpairs')[0]; return r ? { report: r.data.report, file: r.file, results: r.data.runs } : { report: null }; }
    throw new Error('wye eval public reqpairs --fetch | --run --set <name> | --report');
}
function print(r) {
    if (r.fetched) { console.log(`source: ${r.fetched.source}\nput the CSVs (req_a, req_b, label) under ${r.fetched.dir}: have ${r.fetched.have.join(', ') || 'none'}; missing ${r.fetched.missing.join(', ') || 'none'}`); return; }
    if (!r.report) { console.log('no reqpairs run yet — the CSVs under eval/public/reqpairs/data, then --run'); return; }
    console.log(`${r.report.title}\nsource: ${r.report.source}\njudge: ${r.report.judge}`);
    for (const row of r.report.rows) console.log(`  ${row.name.padEnd(12)} macro-F1 ${row.ours === null ? 'n/a' : row.ours}  n=${row.n}  published ${row.theirs.published}\n    ${row.note}`);
    for (const res of r.results || []) for (const [l, c] of Object.entries(res.confusion || {})) console.log(`    ${res.set} ${l.padEnd(10)} → ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (r.file) console.log(`written ${r.file}`);
}

module.exports = { run, print, readCsv, sample, macroF1, norm };
