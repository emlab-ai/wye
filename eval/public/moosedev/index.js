'use strict';
// MOOSEDev bench through Wye (module:benchmarks, task:memory.eval-moosedev-import, decision:memory.public-benchmarks).
//   wye eval public moosedev --fetch                  clones github.com/Trivyn/moosedev (Apache-2.0) into data/repo; reads bench/release
//   wye eval public moosedev --import                 release/corpus/codegraph.json → data/products/eval-moosedev/projects/codegraph/docs/*.md
//   wye eval public moosedev --run [--live] [--judge-passes 3] [--limit n]   every runnable task of bench/tasks_public/codegraph
//   wye eval public moosedev --report                 the four numbers beside theirs and mem0's
// What the released artifact carries (bench/release/README.md): the 835 CodeGraph records as title, kind, lifecycle
// status and text — not the graph's edges (constrains, isMotivatedBy, supersedes). So the import keeps kind, status,
// text and provenance; the tasks that need an edge (negation: "no recorded rationale"; multi-hop; "which decision
// replaced X") are reported as not runnable on the released corpus, never as a zero. Their judge prompt is vendored
// unchanged in judge-prompt.md (regrade_judge.py); it runs here on the same judge model as everything else, not on
// GPT-5.4-mini — the report says so.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { REPO, loadProduct } = require('../../lib/product');
const { api, online, WF_URL } = require('../../lib/app');
const { Recording } = require('../../lib/record');
const { writeResult } = require('../../lib/results');
const judge = require('../../../lib/judge');

const DATA = path.join(__dirname, 'data');
const REPO_DIR = path.join(DATA, 'repo');
const BENCH = path.join(REPO_DIR, 'bench');
const PRODUCT = 'eval-moosedev';
const PRODUCT_DIR = path.join(REPO, 'data', 'products', PRODUCT);
const DOCS = path.join(PRODUCT_DIR, 'projects', 'codegraph', 'docs');
const SOURCE = 'github.com/Trivyn/moosedev bench/ (Apache-2.0); arxiv.org/abs/2608.13662';
// published numbers (bench/EVALUATION.md §3–4, the codegraph public-corpus matrix; judge GPT-5.4-mini strict, mean of three passes)
const PUBLISHED = { moosedev: { completeness: 1.00, negation: 0.98, supersession: 0.98, relevance: 0.82 }, mem0: { completeness: 0.18, negation: 0.06, supersession: 0.27, relevance: '0.67–0.90' } };

const KIND = { ArchitecturalDecision: 'decision', Constraint: 'constraint', Requirement: 'req', Lesson: 'lesson', Consequence: 'consequence', SystemComponent: 'system-component', Rationale: 'rationale', AntiPattern: 'anti-pattern' };
const STATUS = { accepted: 'approved', proposed: 'proposed', superseded: 'superseded', deprecated: 'retired' };
const yq = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';

function fetchRepo(log) {
    fs.mkdirSync(DATA, { recursive: true });
    if (!fs.existsSync(path.join(BENCH, 'release'))) { log('cloning github.com/Trivyn/moosedev (shallow)'); execFileSync('git', ['clone', '--depth', '1', 'https://github.com/Trivyn/moosedev', REPO_DIR], { stdio: 'inherit' }); }
    const readme = fs.readFileSync(path.join(BENCH, 'release', 'README.md'), 'utf8');
    return { repo: REPO_DIR, corpus: path.join(BENCH, 'release', 'corpus', 'codegraph.json'), tasks: fs.readdirSync(path.join(BENCH, 'tasks_public', 'codegraph')).length, readme: readme.split('\n').slice(0, 6).join('\n') };
}

function importCorpus(log) {
    const corpus = JSON.parse(fs.readFileSync(path.join(BENCH, 'release', 'corpus', 'codegraph.json'), 'utf8'));
    fs.rmSync(PRODUCT_DIR, { recursive: true, force: true }); fs.mkdirSync(DOCS, { recursive: true });
    fs.writeFileSync(path.join(PRODUCT_DIR, '_product.md'), `---\ntitle: MOOSEDev bench — CodeGraph corpus\nicon: 🧪\ndescription: The 835 CodeGraph records of the MOOSEDev benchmark release as typed cards (eval/public/moosedev); a scratch product, never committed.\n---\n`);
    fs.writeFileSync(path.join(PRODUCT_DIR, 'projects', 'codegraph', '_project.md'), `---\ntitle: codegraph\n---\n`);
    // their ontology's kinds that Wye's base ontology lacks, as type cards (software-architecture.ttl: Consequence, SystemComponent, Rationale, AntiPattern)
    const types = ['consequence', 'system-component', 'rationale', 'anti-pattern'].map(t => `- id: type:${t}\n  extends: type:node\n  purpose: MOOSEDev's ${Object.keys(KIND).find(k => KIND[k] === t)} (software-architecture ontology), imported for the benchmark\n  open: true\n  props:\n    text: text?\n    source: string?\n    kind-of-record: string?`).join('\n');
    fs.writeFileSync(path.join(DOCS, 'ontology.md'), `---\nnode: module:ontology\ntitle: Ontology\n---\n\n# Ontology\n\nThe MOOSEDev record kinds that are not base kinds of Wye. ArchitecturalDecision → decision, Constraint → constraint, Requirement → req, Lesson → lesson are the base ones; lifecycle status maps accepted → approved, proposed → proposed, superseded → superseded, deprecated → retired.\n\n\`\`\`yaml\n${types}\n\`\`\`\n`);
    const byKind = {}; const taken = new Set(); let n = 0;
    for (const r of corpus) {
        const kind = KIND[r.kind]; if (!kind) { log(`unknown kind ${r.kind}`); continue; }
        const base = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'record';
        let slug = base; for (let i = 2; taken.has(kind + ':' + slug); i++) slug = `${base}-${i}`; taken.add(kind + ':' + slug);
        const text = r.text.replace(/^# .*\n\n(?:Lifecycle status: \w+\n\n)?/, '').trim();
        // requirements as prose lines: Wye's lint asks an approved yaml requirement for its mechanism (satisfied-by), which their corpus does not have
        const card = kind === 'req' ? `req:cg.${slug} ${r.title.replace(/[#()]/g, ' ')} — ${text.replace(/[#()]/g, ' ').replace(/\s+/g, ' ')} #${STATUS[r.status] || r.status} (source: ${r.iri}, kind-of-record: ${r.kind})` : [`- id: ${kind}:cg.${slug}`, `  title: ${yq(r.title)}`, kind === 'constraint' || kind === 'lesson' ? `  statement: ${yq(text)}` : kind === 'decision' ? `  choice: ${yq(text)}` : kind === 'req' ? `  then: ${yq(text)}` : `  text: ${yq(text)}`, `  status: ${STATUS[r.status] || r.status}`, `  source: ${r.iri}`, `  kind-of-record: ${r.kind}`].join('\n');
        (byKind[kind] = byKind[kind] || []).push(card); n++;
    }
    for (const [kind, cards] of Object.entries(byKind)) {
        const title = { decision: 'Architectural decisions', constraint: 'Constraints', req: 'Requirements', lesson: 'Lessons', consequence: 'Consequences', 'system-component': 'System components', rationale: 'Rationales', 'anti-pattern': 'Anti-patterns' }[kind];
        const body = kind === 'req' ? cards.join('\n\n') : '```yaml\n' + cards.join('\n') + '\n```';
        fs.writeFileSync(path.join(DOCS, `${kind}s.md`), `---\nnode: module:${kind}s\ntitle: ${title}\n---\n\n# ${title}\n\n${cards.length} ${title.toLowerCase()} of the CodeGraph corpus (MOOSEDev release), provenance in \`source:\`.\n\n${body}\n`);
    }
    // ctx check must be green before any run: an import error would be scored as a memory error
    execFileSync(process.execPath, [path.join(REPO, 'bin', 'ctx.js'), 'build', '--root', path.relative(REPO, PRODUCT_DIR)], { cwd: REPO, stdio: 'ignore' });
    let check = ''; try { check = execFileSync(process.execPath, [path.join(REPO, 'bin', 'ctx.js'), 'check', '--root', path.relative(REPO, PRODUCT_DIR)], { cwd: REPO, encoding: 'utf8' }); } catch (e) { check = (e.stdout || '') + (e.stderr || ''); throw new Error('ctx check failed on the import:\n' + check.slice(-1500)); }
    log(`imported ${n} records into ${path.relative(REPO, DOCS)}; ${check.trim().split('\n').pop()}`);
    return { records: n, byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])), docs: path.relative(REPO, DOCS) };
}

// the tasks the import can answer: a set by kind / status, a currency or relevance question; the ones that need an edge are reported not runnable
function loadTasks() {
    const dir = path.join(BENCH, 'tasks_public', 'codegraph');
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).map(t => {
        const needsEdge = ['negation', 'multi_hop'].includes(t.capability_class) || ['sup_current_replacements', 'sup_head_of_reversal'].includes(t.id);
        const cls = t.capability_class === 'set_completeness' ? 'completeness' : t.capability_class === 'supersession' ? 'supersession' : t.capability_class === 'negation' ? 'negation' : t.capability_class === 'multi_hop' ? 'multi-hop' : 'relevance';
        return { ...t, cls, runnable: !needsEdge, why: needsEdge ? 'needs graph edges the released corpus does not carry' : '' };
    });
}

const SYSTEM = `You answer questions about a software project from its memory, which is a Wye product. You cannot read the project's files: the only tools you have are these shell commands, and the answer must come from what they return:
- wf context "<text>" --limit 30 [--all]   the knowledge closest to a text (30 hits at most; superseded / retired records are hidden unless --all)
- wf packet --for "<text>"                  the rules, constraints, decisions and goals that govern a text
- wf node <id>                              one record with its properties and relations (its status, its text)
- wf resolve <id>                           the same, from a link
Records are typed cards: decision:cg.* (architectural decisions), constraint:cg.*, req:cg.* (requirements), lesson:cg.*, consequence:cg.*, system-component:cg.*, rationale:cg.*, anti-pattern:cg.*. Their status is approved (their "accepted"), proposed, superseded or retired (their "deprecated"). Run as many commands as you need within the budget, then answer. For a list, give every item's exact title, one per line. Answer plainly; do not ask questions back.`;

function askAgent(prompt, { model, maxTurns = 25 } = {}) {
    return new Promise((resolve, reject) => {
        const args = ['-p', '--output-format', 'json', '--model', model, '--max-turns', String(maxTurns), '--append-system-prompt', SYSTEM, '--allowedTools', 'Bash(wf context:*)', 'Bash(wf packet:*)', 'Bash(wf node:*)', 'Bash(wf resolve:*)', '--disallowedTools', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'MultiEdit', 'Agent', 'Task', 'WebFetch', 'WebSearch', 'Bash(cat:*)', 'Bash(ls:*)', 'Bash(find:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(ctx:*)', 'Bash(node:*)'];
        const child = spawn('claude', args, { cwd: require('os').tmpdir(), env: { ...process.env, WF_URL, WF_PRODUCT: PRODUCT, WF_SESSION: '' } });
        let out = '', err = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('agent timed out')); }, 15 * 60000);
        child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
        child.on('close', code => { clearTimeout(timer); if (code !== 0) return reject(new Error(`agent exited ${code}: ${err.slice(-300)}`)); try { const j = JSON.parse(out); resolve({ answer: String(j.result || ''), usage: j.usage ? { in: (j.usage.input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0) + (j.usage.cache_read_input_tokens || 0), out: j.usage.output_tokens || 0, turns: j.num_turns, cost: j.total_cost_usd } : null }); } catch { resolve({ answer: out, usage: null }); } });
        child.stdin.end(prompt);
    });
}

// their judge, verbatim (judge-prompt.md ← bench/regrade_judge.py _covered_chunk): which known items the answer covers
const JUDGE_PROMPT = fs.readFileSync(path.join(__dirname, 'judge-prompt.md'), 'utf8').split('\n---\n').pop().trim();
async function judgeCovered(answer, expected, { model, rec, pass }) {
    const CHUNK = 120; const covered = new Set();
    for (let s = 0; s < expected.length; s += CHUNK) {
        const chunk = expected.slice(s, s + CHUNK);
        const known = chunk.map((t, i) => `${i + 1}. ${t}`).join('\n');
        const prompt = JUDGE_PROMPT.replace('{known}', known).replace('{answer}', answer);
        const ans = await rec.get({ prompt, model, pass }, () => judge.ask(prompt, { model }), { what: `moosedev judge pass ${pass}`, meta: { model } });
        const m = String(ans).match(/\{[\s\S]*\}/); let obj = {}; try { obj = m ? JSON.parse(m[0]) : {}; } catch { obj = {}; }
        for (const k of (obj.covered || [])) { const n = Number(k); if (n >= 1 && n <= chunk.length) covered.add(s + n); }
    }
    return covered;
}
// context_qa grading as their grade.py does it: every must_include_any group hit by one of its markers; a stale marker fails currency
function gradeContext(answer, gt) {
    const a = answer.toLowerCase();
    const groups = gt.must_include_any || []; const hit = groups.filter(g => g.some(m => a.includes(String(m).toLowerCase()))).length;
    const stale = (gt.stale_answer_markers || []).some(m => a.includes(String(m).toLowerCase()));
    return { coverage: groups.length ? hit / groups.length : null, stale, hit, groups: groups.length };
}

async function runTasks({ live, model, passes = 3, limit, log }) {
    if (!(await online())) throw new Error('the app is not running (WF_URL): the agent answers through it');
    try { await api('POST', `/api/${PRODUCT}/context`, { text: 'constraint', limit: 1 }); } catch (e) { if (/404/.test(e.message)) throw new Error(`the app does not know ${PRODUCT} — run --import, then restart or wait for the app to pick the product up`); }
    const rec = new Recording('public-moosedev', { live });
    const tasks = loadTasks(); const rows = [];
    for (const t of tasks.slice(0, limit || tasks.length)) {
        if (!t.runnable) { rows.push({ id: t.id, cls: t.cls, runnable: false, why: t.why }); continue; }
        log(`task ${t.id} (${t.cls})`);
        let r; try { r = await rec.get({ task: t.id, prompt: t.prompt, model, system: SYSTEM }, () => askAgent(t.prompt, { model }), { what: `moosedev ${t.id}`, meta: { model } }); } catch (e) { rows.push({ id: t.id, cls: t.cls, runnable: true, error: e.message }); continue; }
        const row = { id: t.id, cls: t.cls, runnable: true, usage: r.usage, answerChars: r.answer.length };
        if (t.type === 'capability_qa') {
            const expected = (t.ground_truth.expected_set || []).map(x => x.title);
            const recalls = [];
            for (let p = 1; p <= passes; p++) { const c = await judgeCovered(r.answer, expected, { model, rec, pass: p }); recalls.push(expected.length ? c.size / expected.length : null); }
            row.expected = expected.length; row.recallPasses = recalls; row.recall = recalls.filter(x => x !== null).length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : null;
        } else { const g = gradeContext(r.answer, t.ground_truth); row.coverage = g.coverage; row.stale = g.stale; row.score = t.cls === 'relevance' ? g.coverage : (g.stale ? 0 : g.coverage); }
        rows.push(row);
    }
    rec.save();
    return rows;
}
const mean = xs => { const v = xs.filter(x => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null; };
function reportOf(rows, model) {
    const of = cls => rows.filter(r => r.cls === cls);
    const score = cls => mean(of(cls).map(r => r.recall ?? r.score));
    const nr = cls => of(cls).filter(r => !r.runnable).length;
    const notRunnable = rows.filter(r => !r.runnable).map(r => r.id);
    const table = [
        { name: 'set completeness', ours: score('completeness'), n: of('completeness').filter(r => r.runnable).length, theirs: { MOOSEDev: PUBLISHED.moosedev.completeness, mem0: PUBLISHED.mem0.completeness } },
        { name: 'negation', ours: null, n: 0, theirs: { MOOSEDev: PUBLISHED.moosedev.negation, mem0: PUBLISHED.mem0.negation }, note: `${nr('negation')} task(s) not runnable: the released corpus has no rationale edges` },
        { name: 'supersession', ours: score('supersession'), n: of('supersession').filter(r => r.runnable).length, theirs: { MOOSEDev: PUBLISHED.moosedev.supersession, mem0: PUBLISHED.mem0.supersession }, note: `${nr('supersession')} of ${of('supersession').length} task(s) need the supersedes edge — not in the release` },
        { name: 'relevance (+ currency)', ours: score('relevance'), n: of('relevance').filter(r => r.runnable).length, theirs: { MOOSEDev: PUBLISHED.moosedev.relevance, mem0: PUBLISHED.mem0.relevance }, note: 'coverage of their marker groups, no judge; a stale marker zeroes a currency answer' },
    ];
    return { title: 'MOOSEDev bench — CodeGraph corpus, through Wye', source: SOURCE, published: 'EVALUATION.md §3–4, codegraph matrix, judge GPT-5.4-mini strict, mean of three passes', judge: `${model} on their judge prompt (not GPT-5.4-mini)`, rows: table, notes: [`not runnable on the released corpus (edges withheld): ${notRunnable.join(', ') || 'none'}`, 'the agent had wf context (30 hits at most), wf packet, wf node, wf resolve — no file reads', 'multi-hop tasks are not in the four numbers (their table omits them too)'] };
}

async function run(opts) {
    const log = opts.log || (m => console.error('moosedev: ' + m));
    const model = opts.model || judge.DEFAULT_MODEL;
    if (opts.fetch) return { fetched: fetchRepo(log) };
    if (opts.import) return { imported: importCorpus(log) };
    if (opts.runIt) {
        const live = !!opts.live || process.env.WATERFALL_LIVE === '1';
        const rows = await runTasks({ live, model, passes: opts.judgePasses || 3, limit: opts.limit, log });
        const P = loadProduct('waterfall'); const eP = fs.existsSync(PRODUCT_DIR) ? loadProduct(PRODUCT) : null;
        const report = reportOf(rows, model);
        const scores = Object.fromEntries(report.rows.filter(r => r.ours !== null).map(r => [`moosedev.${r.name.replace(/[^a-z]+/g, '-').replace(/-$/, '')}`, { value: r.ours, n: r.n, judge: r.name !== 'relevance (+ currency)' }]));
        const { file } = writeResult(P.productDir, 'public-moosedev', { graphSha: eP ? eP.graphSha : null, gitSha: P.gitSha, live, model, promptHashes: { judge: 'moosedev/regrade_judge.py' }, judge: { model, prompt: 'their judge prompt, vendored' }, scores, runs: rows, report }, { baseline: 'public benchmarks are not gated' });
        return { rows, report, file };
    }
    if (opts.reportIt) { const { listResults } = require('../../lib/results'); const P = loadProduct('waterfall'); const r = listResults(P.productDir, 'public-moosedev')[0]; if (!r) return { report: null }; return { report: r.data.report, file: r.file, rows: r.data.runs }; }
    throw new Error('wye eval public moosedev --fetch | --import | --run | --report');
}
function print(r) {
    if (r.fetched) { console.log(`fetched: ${r.fetched.repo} — corpus ${r.fetched.corpus}, ${r.fetched.tasks} public tasks\n${r.fetched.readme}`); return; }
    if (r.imported) { console.log(`imported ${r.imported.records} records → ${r.imported.docs}: ${Object.entries(r.imported.byKind).map(([k, v]) => `${k} ${v}`).join(', ')}`); return; }
    if (!r.report) { console.log('no moosedev run yet — --fetch, --import, --run'); return; }
    console.log(`${r.report.title}\nsource: ${r.report.source}\njudge: ${r.report.judge}`);
    for (const row of r.report.rows) console.log(`  ${row.name.padEnd(24)} ours ${row.ours === null ? 'n/a'.padStart(6) : String(row.ours).padStart(6)}  n=${row.n}   ${Object.entries(row.theirs).map(([k, v]) => `${k} ${v}`).join('  ')}${row.note ? '\n' + ' '.repeat(28) + row.note : ''}`);
    for (const n of r.report.notes || []) console.log(`  · ${n}`);
    if (r.rows) for (const x of r.rows.filter(x => x.runnable)) console.log(`    ${x.id.padEnd(30)} ${x.recall !== undefined ? 'recall ' + (x.recall === null ? 'n/a' : x.recall.toFixed(2)) + ' of ' + x.expected : 'coverage ' + (x.coverage === null ? 'n/a' : x.coverage.toFixed(2)) + (x.stale ? ' STALE' : '')}${x.usage ? `  ${x.usage.turns} turns, ${x.usage.in} tok` : ''}${x.error ? '  ! ' + x.error : ''}`);
    if (r.file) console.log(`written ${r.file}`);
}

module.exports = { run, print, importCorpus, loadTasks, gradeContext, KIND, STATUS };
