'use strict';
// MemoryAgentBench — conflict resolution through Wye (module:benchmarks, task:memory.eval-mab-adapter).
//   wye eval public memoryagentbench --fetch                        clones github.com/HUST-AI-HYZ/MemoryAgentBench (MIT) and downloads the
//                                                                  Conflict_Resolution parquet from huggingface.co/datasets/ai-hyz/MemoryAgentBench
//   wye eval public memoryagentbench --run --competency cr [--set factconsolidation_sh_6k] [--limit n] [--live]
//   wye eval public memoryagentbench --report
// FactConsolidation: a numbered list of facts injected in order, later facts overriding earlier ones; questions ask
// the current fact (single hop) or a chain of them (multi hop). The Wye adapter: *add* writes every fact as a prose
// node with `since` the injection order into a scratch product and runs write-time adjudication — a later fact that
// contradicts an earlier one about the same subject supersedes it (decision:memory.bitemporal,
// decision:memory.write-time-verdict; the judge of lib/judge.js decides, over the candidates that share the subject);
// *query* takes the hits of the app's search with the currency filter on and a reader turn answers from them alone.
// The metric is theirs: substring exact match. wye_adapter.py is the same adapter for their harness (methods/), driving
// these commands. Published numbers: their Table 3 / Table 10 (GPT-4o-mini backbone) — quoted with the tier.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { REPO, loadProduct } = require('../../lib/product');
const { api, online } = require('../../lib/app');
const { Recording } = require('../../lib/record');
const { writeResult, listResults } = require('../../lib/results');
const judge = require('../../../lib/judge');

const DATA = path.join(__dirname, 'data');
const REPO_DIR = path.join(DATA, 'repo');
const PARQUET = path.join(DATA, 'Conflict_Resolution.parquet');
const PRODUCT = 'eval-mab';
const PRODUCT_DIR = path.join(REPO, 'data', 'products', PRODUCT);
const SOURCE = 'github.com/HUST-AI-HYZ/MemoryAgentBench (ICLR 2026, MIT); huggingface.co/datasets/ai-hyz/MemoryAgentBench; arxiv.org/abs/2507.05257';
// their Table 3 (main, GPT-4o-mini backbone; Letta is MemGPT there) and Table 10 (per context length) — FactConsolidation SH / MH, accuracy in %
const PUBLISHED = {
    table3: { 'Mem0': { sh: 18.0, mh: 2.0 }, 'Letta (MemGPT)': { sh: 28.0, mh: 3.0 }, 'Cognee': { sh: 28.0, mh: 3.0 }, 'GPT-4o-mini (128K, no memory)': { sh: 45.0, mh: 5.0 }, 'BM25': { sh: 48.0, mh: 3.0 } },
    table10: { 'Mem0': { sh: { '32k': 22.0, '64k': 8.0, '262k': 18.0 }, mh: { '32k': 3.0, '64k': 2.0, '262k': 2.0 } }, 'Cognee': { sh: { '32k': 39.0, '64k': 31.0, '262k': 28.0 }, mh: { '32k': 4.0, '64k': 5.0, '262k': 3.0 } } },
};

async function fetchAll(log) {
    fs.mkdirSync(DATA, { recursive: true });
    if (!fs.existsSync(path.join(REPO_DIR, 'README.md'))) { log('cloning MemoryAgentBench (shallow)'); execFileSync('git', ['clone', '--depth', '1', 'https://github.com/HUST-AI-HYZ/MemoryAgentBench', REPO_DIR], { stdio: 'inherit' }); }
    if (!fs.existsSync(PARQUET)) { log('downloading Conflict_Resolution parquet'); const r = await fetch('https://huggingface.co/datasets/ai-hyz/MemoryAgentBench/resolve/main/data/Conflict_Resolution-00000-of-00001.parquet'); if (!r.ok) throw new Error('download failed: ' + r.status); fs.writeFileSync(PARQUET, Buffer.from(await r.arrayBuffer())); }
    return { repo: REPO_DIR, parquet: PARQUET, sets: (await loadSets()).map(s => `${s.source} (${s.facts.length} facts, ${s.questions.length} questions)`) };
}
async function loadSets() {
    const { parquetReadObjects } = require('hyparquet');
    const buf = fs.readFileSync(PARQUET); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const rows = await parquetReadObjects({ file: ab });
    return rows.map(r => ({ source: r.metadata.source, facts: String(r.context).split('\n').filter(l => /^\d+\. /.test(l)).map(l => l.replace(/^\d+\. /, '').trim()), questions: r.questions, answers: r.answers, ids: r.metadata.qa_pair_ids }));
}

// the subject + predicate of a fact — what two facts must share to be candidates for a contradiction: the text before its last object phrase
const OBJ = /^(.*\S)\s(is|are|was|were|of|in|at|by|for|with|to|as|on)\s+\S[^,]*$/;   // greedy: the last preposition or copula opens the object phrase
function subjectKey(fact) { let k = fact.replace(/\.$/, ''); const m = k.match(OBJ); if (m && m[1].length > 6) k = `${m[1]} ${m[2]}`; return k.toLowerCase().replace(/\s+/g, ' ').trim(); }

// add: the facts as prose nodes, `since` the order; adjudication: for each fact, the earlier facts with its subject key go to the judge; contradicts → supersedes
async function addFacts(set, { live, model, log, rec }) {
    const facts = set.facts; const byKey = new Map(); const supersedes = new Map(); const pairs = [];
    for (let i = 0; i < facts.length; i++) { const k = subjectKey(facts[i]); const earlier = byKey.get(k) || []; for (const j of earlier) pairs.push({ i, j }); byKey.set(k, [...earlier, i]); }
    log(`${facts.length} facts, ${pairs.length} candidate pair(s) sharing a subject`);
    const asJ = (i) => ({ id: `fact:${i}`, text: facts[i], status: '', date: '' });
    const jp = pairs.map(p => ({ a: asJ(p.j), b: asJ(p.i) }));
    const verdicts = [];
    for (let k = 0; k < jp.length; k += 10) {
        const batch = jp.slice(k, k + 10);
        const v = await rec.get({ set: set.source, batch: batch.map(p => [p.a.id, p.b.id]), model, prompt: judge.promptHash() }, async () => { const out = await judge.judgePairs(batch, { model, budget: { pairs: 10, calls: 1 } }); return out.map(x => x ? { kind: x.kind, conflict: x.conflict, reason: x.reason } : null); }, { what: `mab adjudication ${set.source} ${k}`, meta: { model } });
        verdicts.push(...v);
    }
    verdicts.forEach((v, k) => { if (v && v.kind === 'contradicts') { const { i, j } = pairs[k]; supersedes.set(i, [...(supersedes.get(i) || []), j]); } });
    const superseded = new Set([...supersedes.values()].flat());
    // the document: a prose line per fact; the later fact names what it supersedes, the parser ends the earlier one
    const lines = facts.map((f, i) => `fact:${i} ${f.replace(/[#()]/g, ' ')} #${superseded.has(i) ? 'superseded' : 'approved'} (since: ${String(i).padStart(5, '0')}${supersedes.has(i) ? `, supersedes: ${supersedes.get(i).map(j => `fact:${j}`).join(' ')}` : ''})`);
    const docs = path.join(PRODUCT_DIR, 'projects', 'cr', 'docs');
    fs.rmSync(PRODUCT_DIR, { recursive: true, force: true }); fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(PRODUCT_DIR, '_product.md'), `---\ntitle: MemoryAgentBench — ${set.source}\nicon: 🧪\ndescription: FactConsolidation facts as prose nodes with since and supersedes (eval/public/memoryagentbench); a scratch product, never committed.\n---\n`);
    fs.writeFileSync(path.join(docs, 'ontology.md'), `---\nnode: module:ontology\ntitle: Ontology\n---\n\n# Ontology\n\n\`\`\`yaml\n- id: type:fact\n  extends: type:node\n  purpose: one injected fact of FactConsolidation; since is its injection order, supersedes the fact it overrides\n  open: true\n  props:\n    since: string?\n    supersedes: list of fact? -(inverse)-> superseded-by\n\`\`\`\n`);
    fs.writeFileSync(path.join(docs, 'facts.md'), `---\nnode: module:facts\ntitle: Facts\n---\n\n# Facts\n\n${lines.join('\n\n')}\n`);
    execFileSync(process.execPath, [path.join(REPO, 'bin', 'wye.js'), 'build', '--root', path.relative(REPO, PRODUCT_DIR)], { cwd: REPO, stdio: 'ignore' });
    return { facts: facts.length, pairs: pairs.length, superseded: superseded.size, judged: verdicts.filter(Boolean).length };
}

// query: the hits with the currency filter on, then a reader turn over them alone (ten questions per call)
const READER = `You answer questions from the facts given for each question and nothing else. Answer with the shortest phrase that answers the question (a name, a place, a sport…), no sentence. If the facts do not say, answer "unknown".
Answer with a JSON array only — no prose, no code fence — one object per question, in order: {"i": <index>, "answer": "<phrase>"}.`;
async function answerQuestions(set, { live, model, log, rec, limit, k = 10 }) {
    const qs = set.questions.slice(0, limit || set.questions.length); const rows = [];
    const ctx = [];
    for (let i = 0; i < qs.length; i++) { const { hits } = await rec.get({ set: set.source, q: qs[i], k, kind: 'hits' }, async () => { const j = await api('POST', `/api/${PRODUCT}/context`, { text: qs[i], limit: k }); return { hits: j.hits.map(h => ({ id: h.id, snippet: h.snippet })) }; }, { what: `mab hits ${i}` }); ctx.push(hits); }
    for (let b = 0; b < qs.length; b += 10) {
        const idx = []; for (let i = b; i < Math.min(b + 10, qs.length); i++) idx.push(i);
        const prompt = `${READER}\n\n${idx.map(i => `[${i - b}] Question: ${qs[i]}\nFacts:\n${ctx[i].map(h => '- ' + h.snippet.replace(/^fact:\d+\s*/, '').replace(/\s+/g, ' ').slice(0, 200)).join('\n')}`).join('\n\n')}\n`;
        const ans = await rec.get({ set: set.source, prompt, model }, () => judge.ask(prompt, { model }), { what: `mab reader ${b}`, meta: { model } });
        const m = String(ans).match(/\[[\s\S]*\]/); let arr = []; try { arr = m ? JSON.parse(m[0]) : []; } catch { arr = []; }
        idx.forEach((i, j) => { const a = arr.find(x => x && x.i === j) || arr[j]; const answer = a ? String(a.answer || '') : ''; const gold = set.answers[i]; const ok = gold.some(g => answer.toLowerCase().includes(String(g).toLowerCase())); rows.push({ i, id: set.ids[i], question: qs[i], gold, answer, ok, hits: ctx[i].map(h => h.id) }); });
    }
    return rows;
}

async function run(opts) {
    const log = opts.log || (m => console.error('mab: ' + m));
    const model = opts.model || judge.DEFAULT_MODEL;
    if (opts.fetch) return { fetched: await fetchAll(log) };
    if (opts.runIt) {
        const live = !!opts.live || process.env.WATERFALL_LIVE === '1';
        if ((opts.competency || 'cr') !== 'cr') throw new Error('only the conflict-resolution competency (cr) is adapted');
        if (!fs.existsSync(PARQUET)) throw new Error('no data — wye eval public memoryagentbench --fetch');
        if (!(await online())) throw new Error('the app is not running (WF_URL): the hits come from its search');
        const name = opts.set || 'factconsolidation_sh_6k';
        const set = (await loadSets()).find(s => s.source === name); if (!set) throw new Error(`no sub-dataset ${name}`);
        const rec = new Recording('public-memoryagentbench', { live });
        const added = await addFacts(set, { live, model, log, rec });
        log(`added: ${JSON.stringify(added)} — waiting for the app to index the product`);
        // the app builds the scratch product's index on the first search; a superseded fact must be hidden by then
        await new Promise(r => setTimeout(r, 3000));
        const rows = await answerQuestions(set, { live, model, log, rec, limit: opts.limit });
        rec.save();
        const acc = rows.length ? Math.round((rows.filter(r => r.ok).length / rows.length) * 1000) / 10 : null;
        const hop = /_mh_/.test(name) ? 'mh' : 'sh'; const tier = name.split('_').pop();
        const theirs = {}; for (const [who, v] of Object.entries(PUBLISHED.table3)) theirs[who + ' (Table 3)'] = v[hop]; for (const [who, v] of Object.entries(PUBLISHED.table10)) if (v[hop][tier] !== undefined) theirs[`${who} (Table 10, ${tier})`] = v[hop][tier];
        const report = { title: `MemoryAgentBench — conflict resolution, ${name}`, source: SOURCE, published: 'Table 3 (GPT-4o-mini backbone; main) and Table 10 (per context length); accuracy = substring exact match', judge: 'none for the score (substring exact match); the judge adjudicates supersession at write time', rows: [{ name: `FactConsolidation ${hop.toUpperCase()} accuracy (${tier})`, ours: acc, n: rows.length, theirs, note: tier === '6k' ? 'the 6k tier has no published row; the 32k numbers are the nearest' : '' }], notes: [`adjudication: ${added.pairs} candidate pairs sharing a subject, ${added.judged} judged, ${added.superseded} facts superseded at write time`, `retrieval: the app's search, ${10} hits with the currency filter on; reader ${model}, ten questions per call`, 'wye_adapter.py runs the same adapter inside their harness (methods/); the numbers here come from the standalone runner'] };
        const P = loadProduct('waterfall'); const eP = loadProduct(PRODUCT);
        const { file } = writeResult(P.productDir, 'public-memoryagentbench', { graphSha: eP.graphSha, gitSha: P.gitSha, live, model, promptHashes: { verdict: judge.promptHash() }, judge: { model, prompt: judge.promptHash() }, scores: { [`memoryagentbench.fc-${hop}-${tier}`]: { value: acc === null ? null : acc / 100, n: rows.length } }, runs: rows, meta: added, report }, { baseline: 'public benchmarks are not gated' });
        return { report, rows, file, added };
    }
    if (opts.reportIt) { const P = loadProduct('waterfall'); const r = listResults(P.productDir, 'public-memoryagentbench')[0]; return r ? { report: r.data.report, file: r.file, rows: r.data.runs } : { report: null }; }
    throw new Error('wye eval public memoryagentbench --fetch | --run --competency cr | --report');
}
function print(r) {
    if (r.fetched) { console.log(`fetched ${r.fetched.repo}; ${r.fetched.parquet}\nsub-datasets: ${r.fetched.sets.join('; ')}`); return; }
    if (!r.report) { console.log('no memoryagentbench run yet — --fetch, then --run --competency cr'); return; }
    console.log(`${r.report.title}\nsource: ${r.report.source}`);
    for (const row of r.report.rows) console.log(`  ${row.name}: ours ${row.ours === null ? 'n/a' : row.ours + '%'} (n=${row.n})\n${Object.entries(row.theirs).map(([k, v]) => `    ${k.padEnd(36)} ${v}%`).join('\n')}${row.note ? '\n    ' + row.note : ''}`);
    for (const n of r.report.notes || []) console.log(`  · ${n}`);
    if (r.rows) { const miss = r.rows.filter(x => !x.ok).slice(0, 8); for (const m of miss) console.log(`    ✗ ${m.question.slice(0, 70)} → "${m.answer}" (gold ${m.gold.join(' | ')})`); }
    if (r.file) console.log(`written ${r.file}`);
}

module.exports = { run, print, subjectKey, loadSets, __addFacts: addFacts };
