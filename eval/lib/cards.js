'use strict';
// The results as knowledge (task:memory.eval-cards, req:memory.eval-page, constraint:wf2.no-custom-pages): every
// results file under _build/eval becomes cards of the Evaluation project's types — an eval-run per file, an
// eval-score per number, an eval-pair per with-and-without pair, an eval-public per public benchmark row — in
// data/products/<product>/projects/evaluation/docs/runs.md, which the Results page shows through the table and view
// blocks. The document is regenerated from the files after every run (`wye eval cards` does it by hand); the JSON
// files stay the store (store:eval-results), the cards are what the product knows. A pair's arm scores stay hidden
// on its card until a mark is set, so the mark is blind.
const fs = require('fs');
const path = require('path');
const { listResults, fmt } = require('./results');

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim() + '"';
const yq = (k, v) => v === null || v === undefined || v === '' ? '' : `  ${k}: ${typeof v === 'number' ? v : q(v)}`;
const runsDoc = productDir => path.join(productDir, 'projects', 'evaluation', 'docs', 'runs.md');
const pct = s => fmt(s, s.value);

function cardsFor(productDir) {
    const dir = path.join(productDir, '_build', 'eval');
    if (!fs.existsSync(dir)) return { runs: [], scores: [], pairs: [], pub: [] };
    const suites = [...new Set(fs.readdirSync(dir).map(f => (f.match(/^\d{4}-\d{2}-\d{2}(?:T[\d-]+)?-(.+)\.json$/) || [])[1]).filter(Boolean))];
    const runs = [], scores = [], pairs = [], pub = [];
    for (const suite of suites) for (const r of listResults(productDir, suite)) {
        const d = r.data; const rid = `eval-run:${r.date}-${suite}`; const kind = suite === 'own' ? 'own' : suite === 'compare' ? 'compare' : suite === 'judge' ? 'judge' : 'public';
        const gate = d.gate ? (d.gate.baseline ? 'not-gated' : d.gate.passed ? 'passed' : 'failed') : 'not-gated';
        runs.push([`- id: ${rid}`, `  title: ${q(`${suite} — ${r.date}${d.live ? ' (live)' : ' (replayed)'}`)}`, `  suite: ${kind}`, `  date: ${r.date}`, yq('graph-sha', d.graphSha), yq('git', d.gitSha), yq('model', d.model), yq('judge', d.judge ? `${d.judge.model || ''}${d.judge.prompt ? ' @ ' + d.judge.prompt : ''}${d.judge.kappa !== null && d.judge.kappa !== undefined ? ' κ ' + d.judge.kappa : ''}` : ''), yq('prompts', d.promptHashes ? Object.entries(d.promptHashes).map(([k, v]) => `${k} ${v}`).join(', ') : ''), `  gate: ${gate}`, yq('truth', d.truth ? `${d.truth.file}: ${['requirements', 'supersessions', 'commits', 'sessions', 'consolidation'].map(k => `${k} ${d.truth[k]}`).join(', ')}` : ''), (d.errors || []).length ? yq('truth', `${d.truth ? '' : ''}errors: ${(d.errors || []).join('; ')}`) : ''].filter(Boolean).join('\n'));
        for (const [name, s] of Object.entries(d.scores || {})) {
            if (suite === 'compare') continue;   // a pair's numbers live on its eval-pair card
            scores.push([`- id: eval-score:${r.date}-${suite}.${slug(name)}`, `  title: ${q(`${name} ${pct(s)}`)}`, `  run: ${rid}`, `  name: ${q(name)}`, `  value: ${q(pct(s))}`, yq('n', s.n), yq('previous', s.previous === null || s.previous === undefined ? '' : fmt(s, s.previous)), yq('delta', s.delta === null || s.delta === undefined ? '' : `${s.delta > 0 ? '+' : ''}${s.delta} pts`), s.gated === false ? '' : yq('tolerance', s.tolerance ?? 5), yq('kappa', s.judge ? (s.judge.kappa === null || s.judge.kappa === undefined ? 'n/a' : String(s.judge.kappa)) : ''), yq('what', s.note || '')].filter(Boolean).join('\n'));
        }
        for (const p of d.pairs || []) {
            const marked = (p.runRows || []).length > 0 && (p.runRows || []).every(x => typeof x.mark === 'number');
            const arm = a => { const s = p.byArm && p.byArm[a]; if (!s) return ''; if (!marked) return `hidden until the mark is set (${s.n} run(s))`; return ['violations', 'idsCited', 'shouldHaveKnown', 'blocks', 'filesChanged', 'tokensIn', 'wallS', 'cost', 'mark'].map(k => `${k} ${s[k] === null || s[k] === undefined ? 'n/a' : s[k]}`).join(', '); };
            pairs.push([`- id: eval-pair:${slug(p.id)}`, `  title: ${q(p.request.slice(0, 100))}`, `  run: ${rid}`, `  request: ${q(p.request)}`, yq('agent', `${p.agent}${p.model ? ' ' + p.model : ''}`), yq('runs', p.runs), yq('with', arm('with')), yq('without', arm('without')), yq('mark', marked ? (p.runRows || []).map(x => `${x.arm}-${x.n}=${x.mark}`).join(' ') : 'unmarked — wye eval compare --pair ' + p.id + ' --mark <arm>-<n>=<1-5>, each run once, then the arms show'), yq('judge', p.judge && p.judge.kappa !== null && p.judge.kappa !== undefined ? `κ ${p.judge.kappa}` : 'κ n/a'), yq('transcripts', `_build/eval/compare/${p.id}/`)].filter(Boolean).join('\n'));
        }
        if (d.report && Array.isArray(d.report.rows)) for (const row of d.report.rows) {
            pub.push([`- id: eval-public:${r.date}-${slug(suite.replace(/^public-/, ''))}.${slug(row.name)}`, `  title: ${q(`${d.report.title.split(' — ')[0]}: ${row.name}`)}`, `  run: ${rid}`, `  benchmark: ${q(d.report.title)}`, yq('task', row.name), yq('ours', row.ours === null || row.ours === undefined ? 'n/a' : `${row.ours}${row.n !== undefined ? ` (n=${row.n})` : ''}`), yq('published', Object.entries(row.theirs || {}).map(([k, v]) => `${k} ${v}`).join('; ') + (d.report.published ? ` — ${d.report.published}` : '')), yq('source', d.report.source), yq('note', [row.note, ...(d.report.notes || [])].filter(Boolean).join(' · '))].filter(Boolean).join('\n'));
        }
    }
    return { runs, scores, pairs, pub };
}

function writeCards(productDir, { log = () => {} } = {}) {
    const file = runsDoc(productDir);
    if (!fs.existsSync(path.dirname(file))) return null;   // a product without an Evaluation project keeps the JSON only
    const c = cardsFor(productDir);
    const section = (title, cards, note) => `\n## ${title}\n\n${note}\n\n${cards.length ? '```yaml\n' + cards.join('\n') + '\n```' : '_none yet_'}\n`;
    const md = `---\nnode: module:eval-runs\ntype: module\ntitle: Runs\nstatus: proposed\nowner: alex\nlast-verified: ${new Date().toISOString().slice(0, 10)}\norder: 30\n---\n\n# Runs\n\nEvery run the harness made, as cards of the Evaluation project's types (module:eval-ontology) — written by \`wye eval\` from the results files under \`_build/eval/\` (store:eval-results) after every run, and regenerated by \`wye eval cards\`; edit the JSON, not this page. The Results page (module:eval-results) shows these cards through the table and view blocks (constraint:wf2.no-custom-pages).\n${section('Runs', c.runs, 'One card per results file: the suite, the graph and git shas, the model, the judge, the prompt hashes and the gate.')}${section('Scores', c.scores, 'One card per number, with the previous run, the delta in points, the tolerance it is gated against and the judge\'s κ when a model scored it.')}${section('With and without', c.pairs, 'One card per pair; the arms\' scores stay hidden until every run is marked (the mark is blind).')}${section('Public benchmarks', c.pub, 'One card per public benchmark row: ours beside the published numbers, with the source.')}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md);
    log(`cards: ${c.runs.length} run(s), ${c.scores.length} score(s), ${c.pairs.length} pair(s), ${c.pub.length} public row(s) → ${path.relative(process.cwd(), file)}`);
    return { file, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length])) };
}

module.exports = { writeCards, cardsFor, runsDoc };
