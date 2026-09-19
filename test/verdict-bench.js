'use strict';
// The verdict-pass benchmark (decision:memory.benchmark): the product's drift rows are known-true contradictions with
// both sides in the graph. Each pair goes to the judge; recall = the share that comes back as contradicts, by conflict
// kind. Precision proxy: a fixed sample of same-kind pairs that share a neighbour and are not in any drift row —
// the share the judge leaves alone. Verdicts are recorded in test/fixtures/verdict-bench.json, so CI replays them
// without a model; WATERFALL_LIVE=1 asks the model for pairs the record does not have (a new model or prompt).
//   node test/verdict-bench.js [--root data/products/waterfall] [--negatives 30] [--json]
const path = require('path');
const fs = require('fs');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');
const { judgePairs, nodeText, promptHash, DEFAULT_MODEL } = require('../lib/judge');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const ROOT = opt('root', 'data/products/waterfall');
const RECORD = path.join(__dirname, 'fixtures', 'verdict-bench.json');
const LIVE = process.env.WATERFALL_LIVE === '1';
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('_') || e.name === 'inbox') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p); } })(ROOT);
const g = new Graph(parseFiles(files.sort()));
const asJudged = n => ({ id: n.id, kind: n.kind, status: n.status, date: (n.body || '').match(/^date:\s*(\S+)/m)?.[1] || '', text: nodeText(n) });

// positives: every drift row with two defined sides (the first two), the row's `what` as the expected reason
const positives = [];
for (const d of g.data.nodes.filter(n => n.kind === 'drift' && n.defined)) {
    const sides = (g.out.get(d.id) || []).filter(e => e.verb === 'contradicts').map(e => g.node(e.to)).filter(n => n && n.defined && n.body);
    if (sides.length < 2) continue;
    positives.push({ a: asJudged(sides[0]), b: asJudged(sides[1]), drift: d.id, what: d.title });
}
// negatives: same-kind pairs sharing a neighbour, not in a drift row, a deterministic sample
const inDrift = new Set(positives.flatMap(p => [p.a.id + '|' + p.b.id, p.b.id + '|' + p.a.id]));
let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const negatives = g.deepPairs({ limit: 5000 }).filter(p => !inDrift.has(p.a.id + '|' + p.b.id)).sort(() => rnd() - 0.5).slice(0, +opt('negatives', 30));

(async () => {
    // without WATERFALL_LIVE the record is the only judge: pairs it lacks are skipped, never asked
    if (!LIVE) process.env.WF_JUDGE_CMD = process.env.WF_JUDGE_CMD || 'node -e "process.stdout.write(\'[]\')"';
    const opts = { cacheFile: RECORD, budget: { pairs: 200, calls: 30 }, log: m => console.error('bench: ' + m) };
    const pv = await judgePairs(positives, opts), nv = await judgePairs(negatives, opts);
    const judgedP = pv.filter(Boolean), judgedN = nv.filter(Boolean);
    const recall = judgedP.length ? judgedP.filter(v => v.kind === 'contradicts').length / judgedP.length : null;
    const precision = judgedN.length ? judgedN.filter(v => v.kind !== 'contradicts').length / judgedN.length : null;
    const byConflict = {}; for (const v of judgedP) { const k = v.kind === 'contradicts' ? v.conflict || 'unspecified' : 'missed'; byConflict[k] = (byConflict[k] || 0) + 1; }
    const models = [...new Set(judgedP.concat(judgedN).map(v => v.model + ' @ ' + v.prompt))];
    const report = { root: ROOT, live: LIVE, model: models, positives: positives.length, judgedPositives: judgedP.length, recall, negatives: negatives.length, judgedNegatives: judgedN.length, precision, byConflict, misses: pv.map((v, i) => v && v.kind !== 'contradicts' ? { drift: positives[i].drift, pair: [positives[i].a.id, positives[i].b.id], got: v.kind, reason: v.reason } : null).filter(Boolean), falseAlarms: nv.map((v, i) => v && v.kind === 'contradicts' ? { pair: [negatives[i].a.id, negatives[i].b.id], conflict: v.conflict, reason: v.reason } : null).filter(Boolean) };
    if (argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); return; }
    const pct = x => x === null ? 'n/a' : Math.round(x * 100) + '%';
    console.log(`verdict benchmark on ${ROOT} — ${LIVE ? 'live' : 'replayed from'} ${path.relative(process.cwd(), RECORD)}; judge ${models.join(', ') || DEFAULT_MODEL + ' @ ' + promptHash()}`);
    console.log(`recall     ${pct(recall)}  (${judgedP.filter(v => v.kind === 'contradicts').length} of ${judgedP.length} drift pairs came back as contradicts; ${positives.length - judgedP.length} unjudged)  by conflict: ${Object.entries(byConflict).map(([k, n]) => k + ' ' + n).join(', ')}`);
    console.log(`precision  ${pct(precision)}  (${judgedN.filter(v => v.kind !== 'contradicts').length} of ${judgedN.length} same-kind neighbour pairs left alone; ${negatives.length - judgedN.length} unjudged)`);
    for (const m of report.misses) console.log(`  missed   ${m.drift}: ${m.pair.join(' ↔ ')} → ${m.got} — ${m.reason}`);
    for (const f of report.falseAlarms) console.log(`  flagged  ${f.pair.join(' ↔ ')} [${f.conflict}] — ${f.reason}`);
    if (!judgedP.length && !LIVE) console.log('(nothing recorded yet — run once with WATERFALL_LIVE=1)');
})().catch(e => { console.error(e); process.exit(1); });
