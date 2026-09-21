'use strict';
// `wye eval …` (task:memory.eval-cli, module:benchmarks): the command family as the page gives it.
//   wye eval own [--suite s] [--live] [--build-truth] [--baseline "<why>"] [--tolerance n]     tier 1
//   wye eval compare --request "<text>" [--ref id ...] [--plan id] --agent claude-code --runs 5 [--arms with,without]   tier 2
//   wye eval public <moosedev|reqpairs|memoryagentbench> --fetch | --import | --run [--live] | --report                  public
//   wye eval judge --agreement [--live] | --sample 50                                                                 the judge set
//   wye eval report [--suite s] [--since date]                                                                        latest / previous / delta
//   wye eval cards                                                                                                    the results as eval-run / eval-score / eval-pair / eval-public cards (Evaluation project)
// Runs in this process (the graph is read from the product's documents, the app is asked for semantic hits and
// packets); exit code 2 when the gate fails.
const path = require('path');
const { report, scoreLine } = require('./lib/results');
const { productDirOf } = require('./lib/product');

async function main(pos, flags) {
    const product = flags.product || process.env.WYE_PRODUCT || process.env.WF_PRODUCT; if (!product) throw new Error('--product <slug> (or WYE_PRODUCT) is required');
    const sub = pos[0];
    const common = { product, live: !!flags.live, json: !!flags.json, baseline: flags.baseline === true ? 'accepted as the baseline' : flags.baseline || null };
    if (sub === 'own') {
        const own = require('./own');
        const r = await own.run({ ...common, suite: flags.suite, buildTruth: !!flags['build-truth'], tolerance: flags.tolerance ? Number(flags.tolerance) : undefined });
        if (r.truth && !r.result) { console.log(`truth built: ${require('./own/truth').truthSummary(r.truth)}`); return 0; }
        own.print(r, { json: !!flags.json });
        return r.drops.length ? 2 : (r.errors.length ? 1 : 0);
    }
    if (sub === 'judge') { const j = require('./judge/agreement'); const r = await j.run({ ...common, sample: flags.sample }); j.print(r); return 0; }
    if (sub === 'compare') { const c = require('./compare'); const r = await c.run({ ...common, request: flags.request, refs: [].concat(flags.ref || []), plan: flags.plan, agent: flags.agent || 'claude-code', runs: Number(flags.runs || 5), arms: String(flags.arms || 'with,without').split(','), model: flags.model, parallel: Number(flags.parallel || 2), pair: flags.pair, mark: flags.mark, rescore: !!flags.rescore, resume: !!flags.resume }); c.print(r); return 0; }
    if (sub === 'public') { const name = pos[1]; if (!['moosedev', 'reqpairs', 'memoryagentbench'].includes(name)) throw new Error('wye eval public <moosedev|reqpairs|memoryagentbench> --fetch | --import | --run | --report'); const a = require(`./public/${name}`); const r = await a.run({ ...common, fetch: !!flags.fetch, import: !!flags.import, runIt: !!flags.run, reportIt: !!flags.report, set: flags.set, sample: flags.sample ? Number(flags.sample) : undefined, judgePasses: flags['judge-passes'] ? Number(flags['judge-passes']) : undefined, competency: flags.competency, limit: flags.limit ? Number(flags.limit) : undefined }); a.print(r); return r && r.drops && r.drops.length ? 2 : 0; }
    if (sub === 'cards') { const r = require('./lib/cards').writeCards(productDirOf(product), { log: m => console.error('eval: ' + m) }); console.log(r ? `written ${r.file}: ${r.runs} run(s), ${r.scores} score(s), ${r.pairs} pair(s), ${r.pub} public row(s)` : 'no Evaluation project under this product — the JSON results stay the only record'); return 0; }
    if (sub === 'report' || !sub) {
        const r = report(productDirOf(product), { suites: flags.suite ? String(flags.suite).split(',') : null, since: flags.since || null });
        if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
        if (!r.suites.length) { console.log(`no results under ${path.join(productDirOf(product), '_build/eval')} — wye eval own`); return 0; }
        for (const s of r.suites) {
            if (!s.latest) continue;
            const d = s.latest.data;
            console.log(`\n${s.suite}  latest ${s.latest.date}${s.previous ? `, previous ${s.previous.date}` : ''}  graph ${d.graphSha || '?'}  model ${d.model || '?'}${d.judge && d.judge.kappa !== null && d.judge.kappa !== undefined ? `  judge κ ${d.judge.kappa}` : ''}${d.gate ? (d.gate.passed ? '  gate ok' : '  GATE FAILED') : ''}`);
            for (const [name, sc] of Object.entries(d.scores || {})) console.log(scoreLine(name, sc));
        }
        return 0;
    }
    throw new Error('wye eval own | compare | public <adapter> | judge | report | cards');
}

module.exports = { main };
