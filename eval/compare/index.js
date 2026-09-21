'use strict';
// Tier 2 — with and without, on the same request (task:memory.eval-compare, req:memory.eval-compare):
//   wye eval compare --request "<text>" [--ref <id> ...] [--plan <id>] --agent claude-code --runs 5 [--arms with,without]
//                   [--model m] [--parallel 2]
//   wye eval compare --pair <id> --mark "<arm>-<n>=<1-5>" ...     the blind mark (the Evaluation page does the same)
//   wye eval compare --pair <id> --rescore                         re-grade kept transcripts (re-running replaces nothing)
// Per run: a scratch worktree from HEAD; the `with` arm gets the first message as the app builds it — the refs
// resolved, the constraint packet, the plan's definition when --plan names one — under the full contract (the
// constitution and the product instructions in the system prompt); the `without` arm gets the same instruction under
// the base contract only: no packet, no constitution, no product instructions, no "read Wye first". Neither arm
// reaches the app (WF_URL points nowhere): the memory arrives only through the prompt, the agent works on the files
// of its worktree, and nothing lands in the real tree. The transcript, the diff and the blocks the run wrote are kept,
// immutable, under _build/eval/compare/<pair>/<arm>-<n>/; eval/compare/score.js scores them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { REPO, loadProduct } = require('../lib/product');
const { api, online, WF_URL } = require('../lib/app');
const { writeResult, evalDir, today, listResults } = require('../lib/results');
const score = require('./score');
const judge = require('../../lib/judge');

const DEAD_URL = 'http://127.0.0.1:9';   // nothing listens: every wf call fails fast
const pairDir = (P, id) => path.join(evalDir(P.productDir), 'compare', id);
const sha = s => crypto.createHash('sha1').update(s).digest('hex');

// the contract without the memory: the sections that tell the agent to read Wye, the constitution and the product's own instructions cut
function baseContract(system) {
    const cut = ['## Read from Wye before you act', '## Constitution', '## Product instructions'];
    const lines = system.split('\n'); const out = []; let skipping = false;
    for (const l of lines) { if (/^## /.test(l)) skipping = cut.some(c => l.startsWith(c)); if (!skipping) out.push(l); }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
const howToWork = (product, cwd) => `\n## How to work\n- Start now: read what you need, make the change, write the knowledge; do not ask for confirmation.\n- You work in a scratch checkout of the repository at ${cwd}; edit the files there. The product's documents are markdown under data/products/${product}/projects/<project>/docs/. The Wye app is not reachable from this run (\`wf\` commands will fail); \`ctx --root data/products/${product} …\` works offline (search, check).\n- Record decisions as \`decision:\` blocks, open questions as \`question:\` blocks and follow-ups as \`- [ ] task:\` lines in the plan document of the project, as the contract says.\n- When you are done, end with a short summary of what you changed.`;

async function buildArms(P, opts) {
    const refs = opts.refs || []; const ctx = [];
    for (const ref of refs) { try { const j = await api('GET', `/api/${P.product}/resolve?link=${encodeURIComponent(ref)}`); ctx.push(`### ${ref}\n${j.title} — ${j.file}\n${j.node ? j.node.body + '\n' + j.node.relations.out.map(([v, ids]) => `${v} → ${ids.join(', ')}`).join('\n') : j.block ? j.block.text : j.section ? j.section.text.slice(0, 6000) : `(document, ${j.length} chars)`}`); } catch (e) { ctx.push(`- ${ref}: could not resolve (${e.message})`); } }
    const packet = await api('POST', `/api/${P.product}/packet`, { text: opts.request, refs, budget: 10000 });
    let definition = '';
    if (opts.plan) { try { const j = await api('GET', `/api/${P.product}/plan?ref=${encodeURIComponent(opts.plan)}`); definition = j.definition ? `\n## Definition of ${opts.plan}\n${j.definition}` : ''; } catch { definition = ''; } }
    const system = await (await fetch(`${WF_URL}/api/${P.product}/agent-prompt`)).text();
    const head = `You are working on the product "${P.product}" (a knowledge base of requirements, rules, decisions, goals and tasks kept as markdown next to the code). This message is the request; nobody will answer questions during this run — do the work now, decide what you must, and say what you left open.\n\n## Request\n${opts.request}${ctx.length ? `\n\n## Context\n${ctx.join('\n\n')}` : ''}`;
    return {
        with: { system, prompt: cwd => `${head}${definition}\n\n## Constraints in force\n${packet.markdown}\n${howToWork(P.product, cwd)}`, packet: packet.markdown, packetNodes: packet.nodes || [] },
        without: { system: baseContract(system), prompt: cwd => `${head}\n${howToWork(P.product, cwd)}`, packet: '', packetNodes: [] },
    };
}

// every worktree of a pair starts from the same commit, pinned when the pair starts — HEAD may move while the runs go
function worktreeAdd(dir, sha = 'HEAD') { fs.mkdirSync(path.dirname(dir), { recursive: true }); execFileSync('git', ['worktree', 'add', '--detach', dir, sha], { cwd: REPO, stdio: 'ignore' }); }
const headSha = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
function worktreeRemove(dir) { try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO, stdio: 'ignore' }); } catch { fs.rmSync(dir, { recursive: true, force: true }); try { execFileSync('git', ['worktree', 'prune'], { cwd: REPO, stdio: 'ignore' }); } catch { /* fine */ } } }

// one run of one arm: the agent in its worktree, stream-json kept as the transcript, the diff and the usage after
function runOne(P, arm, spec, n, dir, opts, log) {
    return new Promise(resolve => {
        const wt = path.join(os.tmpdir(), 'wf-eval', path.basename(path.dirname(dir)), `${arm}-${n}`);
        worktreeRemove(wt); worktreeAdd(wt, opts.commit);
        fs.mkdirSync(dir, { recursive: true });
        const prompt = spec.prompt(wt);
        fs.writeFileSync(path.join(dir, 'prompt.md'), prompt); fs.writeFileSync(path.join(dir, 'system.md'), spec.system);
        const args = opts.agent === 'codex'
            ? ['exec', '--json', '--full-auto', '-C', wt, '-']
            : ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--append-system-prompt', spec.system, ...(opts.model ? ['--model', opts.model] : [])];
        const started = Date.now();
        const child = spawn(opts.agent === 'codex' ? 'codex' : 'claude', args, { cwd: wt, env: { ...process.env, WF_URL: DEAD_URL, WF_PRODUCT: P.product, WF_SESSION: '' } });
        const out = fs.createWriteStream(path.join(dir, 'transcript.jsonl')); let err = ''; let result = null; let buf = '';
        child.stdout.on('data', d => { out.write(d); buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(line); if (j.type === 'result') result = j; } catch { /* partial */ } } });
        child.stderr.on('data', d => { err += d; });
        const timer = setTimeout(() => { log(`${arm}-${n}: timed out after ${opts.timeoutMin} min — killed`); child.kill('SIGKILL'); }, (opts.timeoutMin || 25) * 60000);
        child.on('close', code => {
            clearTimeout(timer); out.end();
            const wall = Date.now() - started;
            let diff = ''; try { execFileSync('git', ['add', '-A'], { cwd: wt, stdio: 'ignore' }); diff = execFileSync('git', ['diff', '--cached', '--no-color'], { cwd: wt, encoding: 'utf8', maxBuffer: 64e6 }); } catch { /* no diff */ }
            fs.writeFileSync(path.join(dir, 'diff.patch'), diff);
            const baseline = new Map(JSON.parse(fs.readFileSync(path.join(path.dirname(dir), 'baseline.json'), 'utf8')));
            const blocks = score.blocksWritten(P, wt, baseline);
            fs.writeFileSync(path.join(dir, 'blocks.json'), JSON.stringify(blocks, null, 1));
            const usage = result ? { in: (result.usage && (result.usage.input_tokens + (result.usage.cache_creation_input_tokens || 0) + (result.usage.cache_read_input_tokens || 0))) || null, out: result.usage && result.usage.output_tokens || null, cost: result.total_cost_usd ?? null, turns: result.num_turns ?? null, durationMs: result.duration_ms ?? null } : null;
            fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ arm, n, exit: code, wallMs: wall, usage, model: opts.model || null, agent: opts.agent, error: result && result.is_error ? String(result.result).slice(0, 500) : (code ? err.slice(-500) : null), finishedAt: new Date().toISOString() }, null, 1));
            worktreeRemove(wt);
            log(`${arm}-${n}: exit ${code}, ${Math.round(wall / 1000)}s, ${blocks.length} block(s), ${diff.split('\n').filter(l => /^diff --git/.test(l)).length} file(s) changed`);
            resolve({ arm, n, exit: code, wallMs: wall });
        });
        child.stdin.on('error', () => {}); child.stdin.end(prompt);
    });
}

async function run(opts) {
    const log = opts.log || (m => console.error('compare: ' + m));
    const P = loadProduct(opts.product);
    if (opts.pair && opts.mark) return mark(P, opts.pair, [].concat(opts.mark));
    if (opts.pair && opts.rescore) return rescore(P, opts.pair, { log });
    if (opts.pair && opts.resume) return resume(P, opts, log);
    if (!opts.request) throw new Error('--request "<text>" is required (or --pair <id> --mark / --rescore / --resume)');
    if (!(await online())) throw new Error('the app is not running (WF_URL): the with arm takes its packet and contract from it');
    const id = `${today()}-${sha(opts.request + (opts.refs || []).join(',')).slice(0, 6)}`;
    const dir = pairDir(P, id); fs.mkdirSync(dir, { recursive: true });
    const arms = await buildArms(P, opts);
    // the baseline the runs are diffed against: HEAD's documents (the worktrees start from HEAD, not the working tree)
    const commit = headSha();
    const baseWt = path.join(os.tmpdir(), 'wf-eval', id, 'base'); worktreeRemove(baseWt); worktreeAdd(baseWt, commit);
    const baseline = score.blocksIn(P, baseWt); worktreeRemove(baseWt);
    fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify([...baseline.entries()]));
    const pair = { id, request: opts.request, refs: opts.refs || [], plan: opts.plan || null, agent: opts.agent, model: opts.model || null, arms: opts.arms, runs: opts.runs, graphSha: P.graphSha, gitSha: P.gitSha, commit, createdAt: new Date().toISOString(), packetNodes: arms.with.packetNodes.map(n => n.id) };
    fs.writeFileSync(path.join(dir, 'pair.json'), JSON.stringify(pair, null, 1));
    fs.writeFileSync(path.join(dir, 'packet.md'), arms.with.packet);
    for (const a of opts.arms) { fs.writeFileSync(path.join(dir, `${a}-system.md`), arms[a].system); fs.writeFileSync(path.join(dir, `${a}-prompt.md`), arms[a].prompt('__WORKTREE__')); }
    log(`pair ${id}: "${opts.request.slice(0, 80)}" — ${opts.arms.join(' vs ')}, ${opts.runs} run(s) per arm, ${opts.agent}${opts.model ? ' ' + opts.model : ''}`);
    // the runs, interleaved across arms so the clock and the model's day treat both alike, `parallel` at a time
    const jobs = []; for (let n = 1; n <= opts.runs; n++) for (const arm of opts.arms) jobs.push({ arm, n });
    const todo = jobs.filter(j => !fs.existsSync(path.join(dir, `${j.arm}-${j.n}`, 'result.json')));   // a kept run is never re-run
    const runOpts = { ...opts, commit };
    let k = 0; const workers = Array.from({ length: Math.max(1, opts.parallel || 1) }, async () => { while (k < todo.length) { const j = todo[k++]; await runOne(P, j.arm, arms[j.arm], j.n, path.join(dir, `${j.arm}-${j.n}`), runOpts, log); } });
    await Promise.all(workers);
    return rescore(P, id, { log });
}

// the runs a pair still lacks (a killed run, a run deleted because it was bad), from the pair's pinned commit and its kept prompts
async function resume(P, opts, log) {
    const dir = pairDir(P, opts.pair); const pair = JSON.parse(fs.readFileSync(path.join(dir, 'pair.json'), 'utf8'));
    const system = { with: fs.readFileSync(path.join(dir, 'with-system.md'), 'utf8'), without: fs.readFileSync(path.join(dir, 'without-system.md'), 'utf8') };
    const prompts = { with: fs.readFileSync(path.join(dir, 'with-prompt.md'), 'utf8'), without: fs.readFileSync(path.join(dir, 'without-prompt.md'), 'utf8') };
    const arms = {}; for (const a of pair.arms) arms[a] = { system: system[a], prompt: cwd => prompts[a].replace(/__WORKTREE__/g, cwd) };
    const jobs = []; for (let n = 1; n <= pair.runs; n++) for (const arm of pair.arms) if (!fs.existsSync(path.join(dir, `${arm}-${n}`, 'result.json'))) jobs.push({ arm, n });
    log(`pair ${pair.id}: ${jobs.length} run(s) to do from ${pair.commit.slice(0, 12)}`);
    const runOpts = { ...opts, agent: pair.agent, model: pair.model, commit: pair.commit };
    let k = 0; await Promise.all(Array.from({ length: Math.max(1, opts.parallel || 1) }, async () => { while (k < jobs.length) { const j = jobs[k++]; await runOne(P, j.arm, arms[j.arm], j.n, path.join(dir, `${j.arm}-${j.n}`), runOpts, log); } }));
    return rescore(P, pair.id, { log });
}
// score every kept run of the pair, write the pair into today's compare results file
async function rescore(P, id, { log = () => {} } = {}) {
    const dir = pairDir(P, id); if (!fs.existsSync(path.join(dir, 'pair.json'))) throw new Error(`no pair ${id} under ${path.dirname(dir)}`);
    const pair = JSON.parse(fs.readFileSync(path.join(dir, 'pair.json'), 'utf8'));
    const marks = fs.existsSync(path.join(dir, 'marks.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'marks.json'), 'utf8')) : {};
    // a mark set on the eval-pair card (`mark: "with-1=4 without-2=3"` on the Runs page) counts the same as --mark
    try { const runs = fs.readFileSync(require('../lib/cards').runsDoc(P.productDir), 'utf8'); const m = runs.match(new RegExp(`- id: eval-pair:${id.replace(/[^a-z0-9]+/gi, '-')}\n(?:  .*\n)*?  mark: "?([^"\n]*)`)); if (m) for (const kv of m[1].split(/[\s,]+/)) { const [run, v] = kv.split('='); if (/^\w+-\d+$/.test(run) && Number(v) >= 1 && Number(v) <= 5 && marks[run] === undefined) marks[run] = Number(v); } } catch { /* no runs document */ }
    const runs = [];
    for (const arm of pair.arms) for (let n = 1; n <= pair.runs; n++) {
        const rd = path.join(dir, `${arm}-${n}`); if (!fs.existsSync(path.join(rd, 'result.json'))) continue;
        const s = await score.scoreRun(P, pair, arm, n, rd, { log, packet: fs.readFileSync(path.join(dir, 'packet.md'), 'utf8') });
        s.mark = marks[`${arm}-${n}`] ?? null;
        fs.writeFileSync(path.join(rd, 'score.json'), JSON.stringify(s, null, 1));
        runs.push(s);
    }
    const byArm = {}; for (const arm of pair.arms) byArm[arm] = score.summarise(runs.filter(r => r.arm === arm));
    const { judgeMeta } = require('../judge/agreement');
    const entry = { ...pair, scoredAt: new Date().toISOString(), judge: judgeMeta(P.productDir), runRows: runs, byArm };
    // today's compare file holds every pair scored today; earlier pairs keep their files
    const file = path.join(evalDir(P.productDir), `${today()}-compare.json`);
    let pairs = []; try { pairs = JSON.parse(fs.readFileSync(file, 'utf8')).pairs || []; } catch { /* first today */ }
    pairs = pairs.filter(p => p.id !== id).concat([entry]);
    const scores = {};
    for (const p of pairs) for (const arm of p.arms) for (const [k, v] of Object.entries(p.byArm[arm] || {})) if (typeof v === 'number') scores[`${p.id}.${arm}.${k}`] = { value: v, n: p.runs, unit: 'points', gated: false };
    writeResult(P.productDir, 'compare', { graphSha: P.graphSha, gitSha: P.gitSha, live: true, model: pair.model || judge.DEFAULT_MODEL, promptHashes: { verdict: judge.promptHash(), shouldHaveKnown: score.promptHash() }, judge: entry.judge, scores, pairs, runs: [] }, { baseline: 'tier 2 is not gated' });
    return { pair: entry, file, dir };
}
function mark(P, id, marks) {
    const dir = pairDir(P, id); const f = path.join(dir, 'marks.json');
    const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    for (const m of marks) { const [run, v] = String(m).split('='); if (!/^\w+-\d+$/.test(run) || !(Number(v) >= 1 && Number(v) <= 5)) throw new Error(`--mark <arm>-<n>=<1-5>, not ${m}`); cur[run] = Number(v); }
    fs.writeFileSync(f, JSON.stringify(cur, null, 1));
    return rescore(P, id);
}
function print(r) {
    const p = r.pair;
    console.log(`pair ${p.id} — "${p.request.slice(0, 80)}" — ${p.agent}${p.model ? ' ' + p.model : ''}, ${p.runs} run(s) per arm; judge κ ${p.judge && p.judge.kappa !== null && p.judge.kappa !== undefined ? p.judge.kappa : 'n/a'}`);
    const keys = ['violations', 'idsCited', 'shouldHaveKnown', 'blocks', 'filesChanged', 'tokensIn', 'tokensOut', 'wallS', 'cost', 'mark'];
    console.log(`  ${'score'.padEnd(18)}${p.arms.map(a => a.padStart(12)).join('')}`);
    for (const k of keys) console.log(`  ${k.padEnd(18)}${p.arms.map(a => String(p.byArm[a] && p.byArm[a][k] !== undefined && p.byArm[a][k] !== null ? p.byArm[a][k] : 'n/a').padStart(12)).join('')}`);
    for (const a of p.arms) { const s = p.byArm[a]; if (s && s.n < p.runs) console.log(`  (${a}: ${s.n} of ${p.runs} runs kept)`); }
    console.log(`written ${r.file}; transcripts under ${r.dir}`);
    if (p.runs < 5) console.log('fewer than five runs per arm: not a number to quote (module:benchmarks)');
}

module.exports = { run, print, rescore, mark, baseContract, pairDir };
